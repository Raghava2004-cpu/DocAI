import os
from groq import Groq

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"  # Free, fast. Alternatives: mixtral-8x7b-32768

def stream_groq(prompt: str, system: str = "You are a helpful AI assistant.") -> str:
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4,
        max_tokens=1024,
    )
    return completion.choices[0].message.content