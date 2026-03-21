# Aurora

A boilerplate FastAPI application connecting Polymarket with Google Gemini LLM.

## Setup

1. **Clone the repository** (or navigate to your directory):

   ```bash
   cd Aurora
   ```

2. **Set up a Python virtual environment**:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**:
   Make sure your virtual environment is activated before installing.

   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**:
   Copy the example environment file and fill in your details (like `GEMINI_API_KEY`):
   ```bash
   cp .env.example .env
   ```
   _Note: API Keys for Polymarket are only required if you implement CLOB trading, not for the public Gamma API events._

## Running the Application

**Important**: You must activate your virtual environment every time you start a new terminal session to avoid `ModuleNotFoundError` errors:

```bash
source venv/bin/activate
```

Start the FastAPI server using Uvicorn:

```bash
uvicorn app:app --reload
```

## Endpoints

- `GET /`: Health check endpoint.
- `GET /polymarket/events?limit=10`: Fetches active events from the Polymarket Gamma API.
- `POST /gemini/chat`: Takes a JSON body `{"query": "Your prompt here"}` and queries the Gemini LLM.
