import fitz  # pyright: ignore[reportMissingImports] # PyMuPDF
import numpy as np
import faiss # pyright: ignore[reportMissingImports]
from sentence_transformers import SentenceTransformer
from groq_client import stream_groq

embedder = SentenceTransformer("all-MiniLM-L6-v2")  # Free, runs locally, ~80MB

def extract_pdf_text(path: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Extract and chunk PDF text."""
    doc = fitz.open(path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()

    if not full_text.strip():
        raise ValueError("PDF appears to be scanned/image-only. No text found.")

    # Chunk by words with overlap
    words = full_text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap

    return chunks

def build_index(chunks: list[str]):
    """Build FAISS index from text chunks."""
    embeddings = embedder.encode(chunks, show_progress_bar=False)
    embeddings = np.array(embeddings).astype("float32")
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)
    return index

def ask_pdf(chunks: list[str], index, question: str, top_k: int = 4) -> str:
    """Retrieve relevant chunks and answer via Groq."""
    q_emb = embedder.encode([question]).astype("float32")
    _, indices = index.search(q_emb, top_k)
    context = "\n\n".join([chunks[i] for i in indices[0] if i < len(chunks)])

    prompt = f"""Use the following document excerpts to answer the question.
If the answer is not in the excerpts, say "I couldn't find that in the document." 

Document excerpts:
{context}

Question: {question}
Answer:"""

    return stream_groq(prompt)
