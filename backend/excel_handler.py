import pandas as pd
from groq_client import stream_groq

def parse_excel(path: str) -> str:
    """Load file and extract structured info using pandas."""
    ext = path.split(".")[-1].lower()
    df = pd.read_csv(path) if ext == "csv" else pd.read_excel(path)

    lines = []
    lines.append(f"Shape: {df.shape[0]} rows × {df.shape[1]} columns")
    lines.append(f"Columns: {', '.join(df.columns.tolist())}")
    lines.append(f"\nData types:\n{df.dtypes.to_string()}")
    lines.append(f"\nNull counts:\n{df.isnull().sum().to_string()}")

    # Stats for numeric columns
    numeric_df = df.select_dtypes(include="number")
    if not numeric_df.empty:
        lines.append(f"\nNumeric summary:\n{numeric_df.describe().round(2).to_string()}")

    # Top values for object columns
    for col in df.select_dtypes(include="object").columns[:5]:
        top = df[col].value_counts().head(3).to_dict()
        lines.append(f"\nTop values in '{col}': {top}")

    # Sample rows
    lines.append(f"\nFirst 5 rows:\n{df.head(5).to_string(index=False)}")

    return "\n".join(lines)

def summarize_excel(df_info: str, question: str = None) -> str:
    """Use Groq to narrate or answer questions about the data."""
    if question:
        prompt = f"""You are a data analyst. Based on this dataset info, answer the question.

Dataset info:
{df_info[:4000]}

Question: {question}
Answer:"""
    else:
        prompt = f"""You are a data analyst. Write a clear, concise summary of this dataset.
Mention key patterns, notable columns, and any interesting stats.

Dataset info:
{df_info[:4000]}

Summary:"""

    return stream_groq(prompt)
