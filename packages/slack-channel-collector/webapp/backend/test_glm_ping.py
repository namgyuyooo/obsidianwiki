import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load env from .env file
dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path)

print("--- Testing GLM Configuration ---")
print(f"GLM_API_URL: {os.environ.get('GLM_API_URL')}")
key = os.environ.get('GLM_API_KEY', '')
masked_key = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else "None"
print(f"GLM_API_KEY: {masked_key}")
print(f"GLM_MODEL: {os.environ.get('GLM_MODEL')}")

from app.glm import is_configured, chat

print(f"is_configured(): {is_configured()}")

try:
    print("Sending ping query to GLM...")
    response = chat(system="Say 'pong' and nothing else.", user="ping", max_tokens=20)
    print("Response from GLM:")
    print(repr(response))
    
    # Try another query
    print("Sending search query '삼성전자 EHM 고객 찾아줘' to GLM...")
    from app.glm import extract_search_filters
    filters = extract_search_filters("삼성전자 EHM 고객 찾아줘")
    print("Extracted filters:")
    print(filters)
    
    print("\nGLM Ping Test Status: SUCCESS")
except Exception as e:
    print(f"\nGLM Ping Test Status: FAILED")
    print(f"Error details: {e}")
