import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from pdf_handler import extract_pdf_text, ask_pdf, build_index
from excel_handler import parse_excel, summarize_excel
from quiz_generator import generate_quiz
from groq_client import stream_groq
import os, shutil, uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory session store: session_id -> {type, path, chunks, index}
sessions = {}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["pdf", "xlsx", "csv", "xls"]:
        raise HTTPException(400, "Only PDF, XLSX, XLS, CSV allowed")

    path = f"{UPLOAD_DIR}/{session_id}.{ext}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    if ext == "pdf":
        chunks = extract_pdf_text(path)
        index = build_index(chunks)
        sessions[session_id] = {"type": "pdf", "path": path, "chunks": chunks, "index": index}
    else:
        df_info = parse_excel(path)
        sessions[session_id] = {"type": "excel", "path": path, "df_info": df_info}

    return {"session_id": session_id, "type": ext, "filename": file.filename}

@app.post("/ask")
async def ask_question(body: dict):
    sid = body.get("session_id")
    question = body.get("question", "")
    session = sessions.get(sid)
    if not session:
        raise HTTPException(404, "Session not found. Please re-upload.")

    if session["type"] == "pdf":
        answer = ask_pdf(session["chunks"], session["index"], question)
    else:
        answer = summarize_excel(session["df_info"], question)

    return {"answer": answer}

@app.post("/summarize")
async def summarize(body: dict):
    sid = body.get("session_id")
    session = sessions.get(sid)
    if not session:
        raise HTTPException(404, "Session not found.")

    if session["type"] == "pdf":
        combined = " ".join(session["chunks"][:6])
        prompt = f"Summarize this document concisely:\n\n{combined[:4000]}"
    else:
        prompt = f"Give a clear summary of this data:\n\n{session['df_info'][:4000]}"

    answer = stream_groq(prompt)
    return {"summary": answer}

@app.post("/quiz")
async def quiz(body: dict):
    sid = body.get("session_id")
    num = body.get("num_questions", 5)
    difficulty = body.get("difficulty", "medium")
    session = sessions.get(sid)
    if not session:
        raise HTTPException(404, "Session not found.")

    if session["type"] == "pdf":
        text = " ".join(session["chunks"][:8])[:5000]
    else:
        text = session["df_info"][:3000]

    questions = generate_quiz(text, num, difficulty)
    return {"questions": questions}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)