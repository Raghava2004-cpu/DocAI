# DocAI — PDF & Excel AI Assistant

Upload PDFs or Excel files and chat with them, get summaries, and generate quizzes — powered by Groq API + RAG.
- Here is the link https://medium.com/@raghavaashok2004/i-built-a-pdf-excel-ai-assistant-upload-any-document-ask-questions-get-summaries-and-generate-68113e021e20
- I explained every detail in the Medium
## Features
- PDF Q&A using RAG (FAISS + sentence-transformers)
- Excel/CSV summarization with pandas
- Quiz generator with scoring
- Powered by Groq (llama-3.1-8b-instant) — free tier

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/docai.git
cd docai
```

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt

cp .env.example .env
# Open .env and paste your Groq API key
# Get free key at: https://console.groq.com
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Run backend
```bash
cd backend
python main.py
```

Open http://localhost:5173

## Get your free Groq API key
1. Go to https://console.groq.com
2. Sign up → API Keys → Create API Key
3. Paste into your `.env` file

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** FastAPI (Python)
- **LLM:** Groq API (llama-3.1-8b-instant)
- **RAG:** FAISS + sentence-transformers (runs locally)
- **PDF:** PyMuPDF
- **Excel:** pandas
