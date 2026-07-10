import os
from pathlib import Path
from dotenv import load_dotenv

# Load env from .env file
dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path)

from app.glm import chat, SEARCH_SYSTEM

try:
    print("--- RAW GLM PING ---")
    res1 = chat(system="Say 'pong' and nothing else.", user="ping", max_tokens=20)
    print(f"Ping response raw: {repr(res1)}")
    
    print("\n--- RAW SEARCH QUERY ---")
    res2 = chat(system=SEARCH_SYSTEM, user="삼성전자 EHM 고객 찾아줘", max_tokens=400)
    print(f"Search query response raw: {repr(res2)}")
except Exception as e:
    print(f"Error: {e}")
