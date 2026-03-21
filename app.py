import os
import httpx
from fastapi import FastAPI, HTTPException
import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(
    title="Polymarket & Gemini API Broker",
    description="A boilerplate FastAPI application connecting Polymarket with Gemini LLM.",
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


@app.post("/gemini/chat")
async def chat_with_gemini(request: QueryRequest):
    """
    Send a prompt to the Gemini LLM.
    """
    try:
        # Use a generalized model assuming environment holds an active key
        model = genai.GenerativeModel("gemini-3-pro-preview")
        response = model.generate_content(request.query)
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API Error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
