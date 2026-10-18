import os
import time
from groq import Groq, RateLimitError

# Fallback-safe: won't crash on import if key missing, only on first call
def get_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY not set. Check your .env file in the backend/ folder.")
    return Groq(api_key=key)

# Primary model comes from the HF Space variable; fallback is fixed
PRIMARY_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
FALLBACK_MODEL = "openai/gpt-oss-120b"


def _call(client, model, system, prompt):
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=1500,  # GPT-OSS thinking uses tokens too, so keep this >= 1500
        extra_body={
            "reasoning_effort": "low",   # fast answers for RAG
            "include_reasoning": False,  # return only the final answer
        },
    )
    return (completion.choices[0].message.content or "").strip()


def stream_groq(prompt: str, system: str = "You are a helpful AI assistant.") -> str:
    client = get_client()
    last_error = None

    for model in (PRIMARY_MODEL, FALLBACK_MODEL):
        for attempt in range(2):  # retry once on rate limit
            try:
                answer = _call(client, model, system, prompt)
                if answer:
                    return answer
                last_error = RuntimeError(f"{model} returned an empty answer")
                break  # empty answer -> try the next model
            except RateLimitError as e:
                last_error = e
                time.sleep(3)  # free tier: wait, then retry once
            except Exception as e:
                last_error = e
                print(f"[groq] {model} failed: {e}")
                break  # other error -> try the next model

    raise RuntimeError(f"All Groq models failed. Last error: {last_error}")
