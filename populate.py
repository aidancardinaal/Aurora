"""
populate.py — Fetch war/conflict markets from Polymarket and enrich with live prices.

Steps:
  1. Fetch events by tag from Gamma API (paginated)
  2. Flatten markets from events, extract key fields
  3. Pre-filter by volume_24hr > threshold
  4. Fetch 24h price history, compute velocity, rank by composite score
  5. Fetch live midpoint prices from CLOB HTTP API
"""

import asyncio
import json
import sys

import httpx

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"
TAGS_FILE = "war_conflict_tags.json"
OUTPUT_FILE = "markets.json"

TAG_SAMPLE_SIZE = 20
MAX_MARKETS = 100
PAGE_LIMIT = 100
VOLUME_24H_THRESHOLD = 1000.0
VELOCITY_MIN = 0.05
MIDPOINT_BATCH_SIZE = 20


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
    return history[-1]["p"] - history[0]["p"]


def rank_and_score(markets: list[dict]) -> list[dict]:
    """Rank by volume and abs(velocity), compute composite score (lower = stronger signal)."""
    by_volume = sorted(markets, key=lambda m: m["volume_24hr"], reverse=True)
    by_velocity = sorted(markets, key=lambda m: abs(m["velocity"]), reverse=True)

    volume_rank = {m["market_id"]: rank + 1 for rank, m in enumerate(by_volume)}
    velocity_rank = {m["market_id"]: rank + 1 for rank, m in enumerate(by_velocity)}

    for m in markets:
        m["signal_score"] = volume_rank[m["market_id"]] + velocity_rank[m["market_id"]]

    return sorted(markets, key=lambda m: m["signal_score"])


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

    # Composite score and cap
    markets = rank_and_score(markets)
    markets = markets[:MAX_MARKETS]
    print(f"  → Top {len(markets)} by composite signal score")

    # Step 5 — Fetch midpoint prices
    print(f"\nStep 5: Fetching midpoint prices ({len(markets)} markets)...")
    token_ids = [m["token_id"] for m in markets]
    midpoints = await fetch_midpoints(token_ids)

    for m in markets:
        m["probability"] = midpoints.get(m["token_id"])

    # Write output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(markets, f, indent=2)
    print(f"\nDone — wrote {len(markets)} markets to {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
