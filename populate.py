"""
populate.py — Fetch war/conflict markets from Polymarket and enrich with live prices.

Steps:
  1. Fetch events by tag from Gamma API (paginated)
  2. Flatten markets from events, extract key fields
  3. Pre-filter by volume_24hr > threshold
  4. Fetch 24h price history, compute velocity, rank by composite score
  5. Fetch live midpoint prices from CLOB HTTP API
  6. Geocode questions to countries via Gemini, group output by country
"""

import asyncio
import json
import os
import sys
from collections import defaultdict

import httpx
from dotenv import load_dotenv
from google import genai
from context_module.fetch_context import (
    fetch_market_context,
    analyse_all,
    CONCURRENCY,
)

load_dotenv()
gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"
TAGS_FILE = "war_conflict_tags.json"
OUTPUT_FILE = "markets.json"

TAG_SAMPLE_SIZE = 100
MAX_MARKETS = 10000
PAGE_LIMIT = 1000
VOLUME_24H_THRESHOLD = 1000.0
VELOCITY_MIN = 0.05
MIDPOINT_BATCH_SIZE = 20
GEOCODE_BATCH_SIZE = 10


async def fetch_events_for_tag(client: httpx.AsyncClient, tag_id: str) -> list[dict]:
    """Paginate through all active, non-closed events for a single tag."""
    events = []
    offset = 0
    while True:
        resp = await client.get(
            f"{GAMMA_BASE}/events",
            params={
                "tag_id": tag_id,
                "active": "true",
                "closed": "false",
                "limit": PAGE_LIMIT,
                "offset": offset,
            },
        )
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        events.extend(page)
        if len(page) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT
    return events


async def fetch_all_events(tag_ids: list[str]) -> list[dict]:
    """Fetch events for every tag and deduplicate by event ID."""
    seen_ids: set[str] = set()
    all_events: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for i, tag_id in enumerate(tag_ids):
            print(f"  [{i + 1}/{len(tag_ids)}] tag_id={tag_id}")
            try:
                events = await fetch_events_for_tag(client, tag_id)
            except httpx.HTTPError as e:
                print(f"    ⚠ failed: {e}")
                continue
            for event in events:
                eid = str(event.get("id", ""))
                if eid and eid not in seen_ids:
                    seen_ids.add(eid)
                    all_events.append(event)
    return all_events


def flatten_markets(events: list[dict]) -> list[dict]:
    """Extract and deduplicate markets from events."""
    seen: set[str] = set()
    markets: list[dict] = []

    for event in events:
        for m in event.get("markets", []):
            condition_id = m.get("conditionId", "")
            if not condition_id or condition_id in seen:
                continue
            seen.add(condition_id)

            clob_token_ids = m.get("clobTokenIds", [])
            if isinstance(clob_token_ids, str):
                try:
                    clob_token_ids = json.loads(clob_token_ids)
                except (json.JSONDecodeError, TypeError):
                    clob_token_ids = []
            if not clob_token_ids:
                continue
            token_id = clob_token_ids[0]

            try:
                volume_24hr = float(m.get("volume24hr", 0))
            except (TypeError, ValueError):
                volume_24hr = 0.0

            try:
                volume = float(m.get("volume", 0))
            except (TypeError, ValueError):
                volume = 0.0

            markets.append(
                {
                    "market_id": condition_id,
                    "question": m.get("question", ""),
                    "token_id": token_id,
                    "volume_24hr": volume_24hr,
                    "volume": volume,
                }
            )
    return markets


def filter_markets(markets: list[dict]) -> list[dict]:
    """Keep only markets with volume_24hr > threshold."""
    return [m for m in markets if m["volume_24hr"] > VOLUME_24H_THRESHOLD]


async def fetch_price_histories(
    token_ids: list[str],
) -> dict[str, list[dict]]:
    """Fetch 24h price history from CLOB in batches. Returns {token_id: [{"t": ..., "p": ...}, ...]}."""
    results: dict[str, list[dict]] = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for i in range(0, len(token_ids), MIDPOINT_BATCH_SIZE):
            batch = token_ids[i : i + MIDPOINT_BATCH_SIZE]
            tasks = [
                client.get(
                    f"{CLOB_BASE}/prices-history",
                    params={"market": tid, "interval": "1d", "fidelity": "60"},
                )
                for tid in batch
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            for tid, resp in zip(batch, responses):
                try:
                    results[tid] = resp.json()["history"]
                except Exception:
                    results[tid] = []
    return results


def compute_velocity(history: list[dict]) -> float | None:
    """Signed velocity: last_price - first_price. Positive = YES more likely."""
    if len(history) < 2:
        return None
    return round(history[-1]["p"] - history[0]["p"], 2)


def _sort_by_signal(markets: list[dict]) -> None:
    """Sort markets by composite signal (volume + velocity rank). First = strongest."""
    by_volume = sorted(markets, key=lambda m: m["volume_24hr"], reverse=True)
    by_velocity = sorted(markets, key=lambda m: abs(m["velocity"]), reverse=True)

    volume_rank = {m["market_id"]: rank for rank, m in enumerate(by_volume)}
    velocity_rank = {m["market_id"]: rank for rank, m in enumerate(by_velocity)}

    markets.sort(
        key=lambda m: volume_rank[m["market_id"]] + velocity_rank[m["market_id"]]
    )


def _build_geocode_prompt(questions: list[str]) -> str:
    numbered = "\n".join(f'{i + 1}. "{q}"' for i, q in enumerate(questions))
    return (
        "For each numbered question below, identify which countries are referenced.\n"
        'Return a JSON array where each element has "index" (1-based int) and '
        '"countries" (list of ISO 3166-1 English short country names, '
        'e.g. "Israel", "Iran", "United States").\n'
        "If no country can be identified, return an empty list for that question.\n"
        "Return ONLY the JSON array, no other text.\n\n"
        f"{numbered}"
    )


def _parse_geocode_response(text: str) -> dict[int, list[str]]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text)
    return {item["index"]: item["countries"] for item in parsed}


async def geocode_markets(markets: list[dict]) -> None:
    """Use Gemini to extract countries from market questions in parallel batches."""
    for m in markets:
        m["countries"] = []

    batches: list[tuple[int, list[dict]]] = []
    for i in range(0, len(markets), GEOCODE_BATCH_SIZE):
        batches.append((i, markets[i : i + GEOCODE_BATCH_SIZE]))

    async def _geocode_batch(offset: int, batch: list[dict]) -> None:
        questions = [m["question"] for m in batch]
        prompt = _build_geocode_prompt(questions)
        try:
            resp = await gemini.aio.models.generate_content(
                model="gemini-3-flash-preview", contents=prompt
            )
            lookup = _parse_geocode_response(resp.text)
            for i, m in enumerate(batch):
                m["countries"] = lookup.get(i + 1, [])
        except Exception as e:
            print(f"    ⚠ Batch at offset {offset} failed: {e}")

    await asyncio.gather(*[_geocode_batch(off, b) for off, b in batches])


def group_by_country(markets: list[dict]) -> list[dict]:
    """Group markets by country, rank within each country."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for m in markets:
        market_data = {k: v for k, v in m.items() if k not in ("token_id", "countries")}
        countries = m.get("countries", [])
        if not countries:
            groups["Unknown"].append(market_data)
        else:
            for country in countries:
                groups[country].append(market_data)

    result = []
    for country, mkts in sorted(groups.items()):
        _sort_by_signal(mkts)
        result.append({"country": country, "markets": mkts})
    return result


async def fetch_midpoints(token_ids: list[str]) -> dict[str, float | None]:
    """Fetch YES midpoint prices from CLOB in batches."""
    results: dict[str, float | None] = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for i in range(0, len(token_ids), MIDPOINT_BATCH_SIZE):
            batch = token_ids[i : i + MIDPOINT_BATCH_SIZE]
            tasks = [
                client.get(
                    f"{CLOB_BASE}/midpoint",
                    params={"token_id": tid},
                )
                for tid in batch
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            for tid, resp in zip(batch, responses):
                try:
                    results[tid] = float(resp.json()["mid"])
                except Exception:
                    results[tid] = None
    return results


async def main():
    # Load tags
    with open(TAGS_FILE) as f:
        data = json.load(f)
    tag_ids = [t["id"] for t in data["tags"]][:TAG_SAMPLE_SIZE]
    print(f"Loaded {len(tag_ids)} tags from {TAGS_FILE} (sample of {TAG_SAMPLE_SIZE})")

    # Step 1 — Fetch events
    print("\nStep 1: Fetching events by tag...")
    events = await fetch_all_events(tag_ids)
    print(f"  → {len(events)} unique events")

    # Step 2 — Flatten markets
    print("\nStep 2: Flattening markets...")
    markets = flatten_markets(events)
    print(f"  → {len(markets)} unique markets")

    # Step 3 — Pre-filter by 24h volume
    print(f"\nStep 3: Pre-filtering by volume_24hr > {VOLUME_24H_THRESHOLD}...")
    markets = filter_markets(markets)
    print(f"  → {len(markets)} markets pass volume threshold")

    if not markets:
        print(
            "\nNo markets passed the volume filter. Try lowering VOLUME_24H_THRESHOLD."
        )
        sys.exit(0)

    # Step 4 — Fetch price history, compute velocity, rank by composite score
    print(f"\nStep 4: Fetching 24h price history ({len(markets)} markets)...")
    token_ids = [m["token_id"] for m in markets]
    histories = await fetch_price_histories(token_ids)

    for m in markets:
        m["velocity"] = compute_velocity(histories.get(m["token_id"], []))

    # Exclude markets with no velocity data or below minimum
    before = len(markets)
    markets = [
        m
        for m in markets
        if m["velocity"] is not None and abs(m["velocity"]) >= VELOCITY_MIN
    ]
    print(
        f"  → {len(markets)} markets with velocity >= {VELOCITY_MIN} (excluded {before - len(markets)})"
    )

    if not markets:
        print("\nNo markets passed the velocity filter. Try lowering VELOCITY_MIN.")
        sys.exit(0)

    # Sort by volume descending and cap
    markets.sort(key=lambda m: m["volume_24hr"], reverse=True)
    markets = markets[:MAX_MARKETS]
    print(f"  → Top {len(markets)} markets")

    # Step 5 — Fetch midpoint prices
    print(f"\nStep 5: Fetching midpoint prices ({len(markets)} markets)...")
    token_ids = [m["token_id"] for m in markets]
    midpoints = await fetch_midpoints(token_ids)

    for m in markets:
        m["probability"] = midpoints.get(m["token_id"])

    # Step 6 — Geocode questions to countries via Gemini
    print(f"\nStep 6: Geocoding {len(markets)} questions via Gemini...")
    await geocode_markets(markets)
    print(f"  → done")

    # Step 7 — Fetch news context and run Gemini analysis
    print(f"\nStep 7: Fetching news context ({len(markets)} markets)...")
    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient() as client:
        context_tasks = [fetch_market_context(client, sem, m) for m in markets]
        context_results = await asyncio.gather(*context_tasks)
    context_map = {mid: data for mid, data in context_results}

    markets_by_id = {m["market_id"]: m for m in markets}
    analysis_results = analyse_all(markets_by_id, context_map)

    for m in markets:
        mid = m["market_id"]
        m["analysis"] = analysis_results.get(mid)

    grouped = group_by_country(markets)
    print(f"  → {len(grouped)} countries")

    # Write output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(grouped, f, indent=2)
    print(f"\nDone — wrote {len(grouped)} countries to {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
