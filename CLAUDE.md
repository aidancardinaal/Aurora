# Aurora - Polymarket LLM Prediction Engine

## Project Overview
Aurora fetches prediction market data from Polymarket and feeds it into an LLM (Google Gemini) to generate predictions. The prediction engine analyzes:
- **Trading volume** over a configurable window (default: last 24 hours)
- **Odds velocity** — the rate of change in outcome ratios over time

## Tech Stack
- **Python 3** with **FastAPI** (async web framework)
- **Google Gemini** (`google-generativeai`) as the LLM backend
- **httpx** for async HTTP requests to Polymarket Gamma API
- **Pydantic** for request/response validation
- **uvicorn** as the ASGI server

## Project Structure
```
Aurora/
├── app.py              # Main FastAPI application (entry point)
├── requirements.txt    # Python dependencies
├── .env.example        # Template for environment variables
├── .env                # Local env vars (not committed)
└── CLAUDE.md           # This file
```

## Development Setup
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # Then fill in GEMINI_API_KEY
```

## Running
```bash
source venv/bin/activate
uvicorn app:app --reload
# or: python app.py
```
Server runs on `http://localhost:8000`.

## API Endpoints
- `GET /` — Health check
- `GET /polymarket/events?limit=10` — Fetch active Polymarket events (Gamma API)
- `POST /gemini/chat` — Send a prompt to Gemini (`{"query": "..."}`)

## Key External APIs
- **Polymarket Gamma API**: `https://gamma-api.polymarket.com/events` — public, no auth required
- **Polymarket CLOB API**: requires `POLYMARKET_API_KEY`, `POLYMARKET_SECRET`, `POLYMARKET_PASSPHRASE` (for trading features)
- **Google Gemini**: requires `GEMINI_API_KEY`

## Code Conventions
- Use **async** endpoints for I/O-bound operations (API calls)
- Raise `HTTPException` for error responses
- Use Pydantic `BaseModel` for request validation
- Keep `.env` out of version control; use `.env.example` as template

## Important Notes
- The prediction engine should treat the time window (default 24h) and velocity parameters as configurable inputs, not hardcoded values
- Polymarket public event data does not require authentication; CLOB trading does
- Current LLM model: `gemini-3-pro-preview`
