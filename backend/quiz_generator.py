import json
from groq_client import stream_groq

def generate_quiz(text: str, num_questions: int = 5, difficulty: str = "medium") -> list:
    prompt = f"""Generate {num_questions} {difficulty}-difficulty multiple choice questions from the text below.

STRICT Rules:
- Return ONLY a valid JSON array, no markdown, no explanation, no extra text
- Each item has exactly these keys: "question", "options", "answer", "explanation"
- "options" is a list of exactly 4 strings (the actual answer text, not letters like A/B/C/D)
- "answer" MUST be the EXACT full string of the correct option (copy it word-for-word from options)
- "explanation" is 1-2 sentences explaining why the answer is correct

Example of correct format:
[
  {{
    "question": "What color is the sky?",
    "options": ["Red", "Blue", "Green", "Yellow"],
    "answer": "Blue",
    "explanation": "The sky appears blue due to Rayleigh scattering of sunlight."
  }}
]

Text to generate questions from:
{text[:4500]}"""

    raw = stream_groq(prompt, system="You are a quiz generator. Return only a valid JSON array. The answer field must exactly match one of the option strings.")

    # Strip markdown fences
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        questions = json.loads(raw)
        if not isinstance(questions, list):
            return []

        # Normalize: if model returned a letter (A/B/C/D) as answer, convert to actual option text
        letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
        cleaned = []
        for q in questions:
            opts = q.get("options", [])
            ans = q.get("answer", "")

            # If answer is a single letter like "A", "B", map it to option text
            if ans.strip().upper() in letter_map and len(opts) == 4:
                idx = letter_map[ans.strip().upper()]
                q["answer"] = opts[idx]

            # If answer is like "A. Blue" extract just "Blue"
            elif len(ans) > 2 and ans[0].upper() in letter_map and ans[1] in (". ", ") "):
                q["answer"] = ans[2:].strip()

            # Final safety: if answer still not in options, pick closest match
            if q["answer"] not in opts and opts:
                # Try case-insensitive match
                for opt in opts:
                    if opt.lower() == q["answer"].lower():
                        q["answer"] = opt
                        break

            cleaned.append(q)
        return cleaned

    except json.JSONDecodeError:
        return [{"question": "Quiz generation failed. Try again.", "options": [], "answer": "", "explanation": raw[:200]}]