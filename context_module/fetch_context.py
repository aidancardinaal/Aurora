import asyncio
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ── Config ────────────────────────────────────────────────────────────────────

MARKETS_PATH = Path(__file__).parent.parent / "markets.json"
OUTPUT_PATH = Path(__file__).parent / "context.json"

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
REDDIT_SEARCH_URL = "https://www.reddit.com/r/{subreddit}/search.json"
REDDIT_SUBREDDITS = ["worldnews", "geopolitics"]
REDDIT_USER_AGENT = "aurora-context-fetcher/1.0"

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_WORKERS = 5

FETCH_TIMEOUT = 8.0       # seconds per request
CONCURRENCY = 5           # max markets fetched simultaneously

FILLER_WORDS = {
    "will", "the", "a", "an", "next", "is", "are", "be", "by", "for",
    "in", "on", "of", "to", "at", "do", "does", "did", "has", "have",
    "had", "was", "were", "their", "its", "this", "that", "with", "from",
}


# ── Query building ─────────────────────────────────────────────────────────────

def build_query(question: str) -> str:
    clean = re.sub(r"[^\w\s]", " ", question)
    tokens = [t for t in clean.split() if t.lower() not in FILLER_WORDS and len(t) > 1]
    return " ".join(tokens)


# ── GDELT ──────────────────────────────────────────────────────────────────────

async def fetch_gdelt(client: httpx.AsyncClient, query: str) -> list[dict]:
    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": 10,
        "format": "json",
        "timespan": "7d",
    }
    try:
        response = await client.get(GDELT_URL, params=params, timeout=FETCH_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        articles = data.get("articles") or []
        return [
            {
                "title": a.get("title", ""),
                "url": a.get("url", ""),
                "source": a.get("domain", ""),
                "date": a.get("seendate", ""),
            }
            for a in articles
        ]
    except Exception:
        return []


# ── Reddit ─────────────────────────────────────────────────────────────────────

async def fetch_reddit_subreddit(
    client: httpx.AsyncClient, subreddit: str, query: str
) -> list[dict]:
    url = REDDIT_SEARCH_URL.format(subreddit=subreddit)
    params = {"q": query, "sort": "new", "limit": 5, "restrict_sr": "true"}
    headers = {"User-Agent": REDDIT_USER_AGENT}
    try:
        response = await client.get(url, params=params, headers=headers, timeout=FETCH_TIMEOUT)
        response.raise_for_status()
        posts = response.json().get("data", {}).get("children", [])
        return [
            {
                "title": p["data"].get("title", ""),
                "score": p["data"].get("score", 0),
                "comments": p["data"].get("num_comments", 0),
                "url": p["data"].get("url", ""),
                "subreddit": subreddit,
                "created_utc": p["data"].get("created_utc", 0),
            }
            for p in posts
        ]
    except Exception:
        return []


async def fetch_reddit(client: httpx.AsyncClient, query: str) -> list[dict]:
    tasks = [fetch_reddit_subreddit(client, sub, query) for sub in REDDIT_SUBREDDITS]
    results = await asyncio.gather(*tasks)
    combined = []
    for r in results:
        combined.extend(r)
    return combined


# ── Per-market fetch ───────────────────────────────────────────────────────────

async def fetch_market_context(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    market: dict,
) -> tuple[str, dict]:
    market_id = market["market_id"]
    question = market["question"]
    query = build_query(question)

    async with sem:
        print(f"  Fetching: {question[:70]}")
        gdelt_results, reddit_results = await asyncio.gather(
            fetch_gdelt(client, query),
            fetch_reddit(client, query),
        )

    result = {
        "market_id": market_id,
        "question": question,
        "gdelt": gdelt_results,
        "reddit": reddit_results,
    }

    gdelt_count = len(gdelt_results)
    reddit_count = len(reddit_results)
    print(f"    -> GDELT: {gdelt_count} articles, Reddit: {reddit_count} posts")

    return market_id, result


# ── Gemini analysis ────────────────────────────────────────────────────────────

def build_prompt(market: dict, context: dict) -> str:
    gdelt_lines = "\n".join(
        f"  - [{a['date']}] {a['title']} ({a['source']})"
        for a in context.get("gdelt", [])[:5]
    ) or "  (none)"

    reddit_lines = "\n".join(
        f"  - [score: {p['score']}] {p['title']}"
        for p in context.get("reddit", [])[:5]
    ) or "  (none)"

    return f"""You are a geopolitical analyst. Analyze the following prediction market and recent news context.

Market question: {market["question"]}
Current probability: {market.get("probability", "N/A")}
Signal score: {market.get("signal_score", "N/A")}
24h volume: {market.get("volume_24hr", "N/A")}
Velocity (odds change): {market.get("velocity", "N/A")}

Recent news headlines (GDELT):
{gdelt_lines}

Recent Reddit posts:
{reddit_lines}

Return ONLY a JSON object with exactly these three fields:
- "summary": 2-3 sentence plain English explanation of what is driving activity in this market, based on the news and signal data. Do not make trading recommendations or predict outcomes.
- "sentiment": one of "escalating", "de-escalating", or "uncertain"
- "confidence": a float 0.0 to 1.0 reflecting how well the news explains the signal

JSON only. No preamble, no markdown, no explanation outside the JSON object."""


def run_gemini_analysis(market: dict, context: dict) -> dict | None:
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        prompt = build_prompt(market, context)
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        return json.loads(text)
    except Exception as e:
        print(f"    [Gemini error] {market['question'][:60]}: {e}")
        return None


def analyse_all(markets_by_id: dict, context_map: dict) -> dict:
    """Run Gemini analysis for all markets that have context but no analysis yet."""
    to_analyse = [
        mid for mid, ctx in context_map.items()
        if "analysis" not in ctx or ctx["analysis"] is None
    ]
    if not to_analyse:
        return {}

    print(f"\nRunning Gemini analysis for {len(to_analyse)} markets...")
    results = {}
    with ThreadPoolExecutor(max_workers=GEMINI_WORKERS) as pool:
        futures = {
            pool.submit(run_gemini_analysis, markets_by_id[mid], context_map[mid]): mid
            for mid in to_analyse
            if mid in markets_by_id
        }
        for future, mid in futures.items():
            question = markets_by_id[mid]["question"]
            try:
                analysis = future.result()
                results[mid] = analysis
                sentiment = analysis.get("sentiment", "?") if analysis else "failed"
                confidence = analysis.get("confidence", "?") if analysis else "?"
                print(f"  [{sentiment} / {confidence}] {question[:65]}")
            except Exception as e:
                print(f"  [error] {question[:65]}: {e}")
                results[mid] = None
    return results


# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    # Load markets — support both flat list and country-grouped format
    with open(MARKETS_PATH) as f:
        raw = json.load(f)
    if raw and isinstance(raw[0], dict) and "markets" in raw[0]:
        markets = [m for group in raw for m in group["markets"]]
    else:
        markets = raw
    markets_by_id = {m["market_id"]: m for m in markets}

    # Load existing context
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            existing = json.load(f)
        print(f"Loaded {len(existing)} existing entries from context.json.")
    else:
        existing = {}

    # Step 1: Fetch context for markets not yet cached
    to_fetch = [m for m in markets if m["market_id"] not in existing]
    print(f"Markets to fetch: {len(to_fetch)} (skipping {len(markets) - len(to_fetch)} cached)\n")

    if to_fetch:
        sem = asyncio.Semaphore(CONCURRENCY)
        async with httpx.AsyncClient() as client:
            tasks = [fetch_market_context(client, sem, m) for m in to_fetch]
            results = await asyncio.gather(*tasks)
        for market_id, data in results:
            existing[market_id] = data

    # Step 2: Run Gemini analysis for markets with context but no analysis
    analysis_results = analyse_all(markets_by_id, existing)
    for mid, analysis in analysis_results.items():
        existing[mid]["analysis"] = analysis

    # Save
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(existing, f, indent=2)

    # Summary
    got_gdelt = sum(1 for v in existing.values() if v["gdelt"])
    got_reddit = sum(1 for v in existing.values() if v["reddit"])
    got_nothing = sum(1 for v in existing.values() if not v["gdelt"] and not v["reddit"])
    got_analysis = sum(1 for v in existing.values() if v.get("analysis"))

    print(f"\n--- Summary ---")
    print(f"Total markets:     {len(existing)}")
    print(f"Got GDELT:         {got_gdelt}")
    print(f"Got Reddit:        {got_reddit}")
    print(f"Got nothing:       {got_nothing}")
    print(f"Got LLM analysis:  {got_analysis}")
    print(f"Output written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
