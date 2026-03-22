import json
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel

load_dotenv()
gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Startup: running populate pipeline...")
    try:
        from populate import main as populate_main
        await populate_main()
        print("Startup: markets.json populated successfully.")
    except SystemExit:
        pass
    except Exception as e:
        print(f"Startup warning: populate failed ({e}). Serving existing markets.json if available.")
    yield


app = FastAPI(
    title="Polymarket & Gemini API Broker",
    description="A boilerplate FastAPI application connecting Polymarket with Gemini LLM.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


@app.get("/")
def read_root():
    return {"message": "Welcome to the Polymarket & Gemini API Broker"}


@app.get("/polymarket/events")
async def get_polymarket_events(limit: int = 10):
    """
    Fetch active events from the Polymarket Gamma API.
    """
    url = f"https://gamma-api.polymarket.com/events?limit={limit}&active=true"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch data from Polymarket: {str(e)}",
            )


# @app.post("/gemini/chat")
# async def chat_with_gemini(request: QueryRequest):
#     """
#     Send a prompt to the Gemini LLM.
#     """
#     try:
#         response = gemini.models.generate_content(
#             model="gemini-2.0-flash", contents=request.query
#         )
#         return {"response": response.text}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Gemini API Error: {str(e)}")


MARKETS_FILE = "markets.json"


@app.get("/markets")
def get_markets():
    """Return the enriched markets data grouped by country."""
    try:
        with open(MARKETS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="markets.json not found. Run populate.py first.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="markets.json contains invalid JSON.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
