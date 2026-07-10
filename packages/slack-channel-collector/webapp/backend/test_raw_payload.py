import os
import json
from urllib.request import Request, urlopen
from pathlib import Path
from dotenv import load_dotenv

# Load env from .env file
dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path)

url = os.environ.get("GLM_API_URL", "").strip().rstrip("/")
key = os.environ.get("GLM_API_KEY", "").strip()
model = os.environ.get("GLM_MODEL", "").strip() or "glm-4"

endpoint = f"{url}/chat/completions" if not url.endswith("/chat/completions") else url

body = {
    "model": model,
    "messages": [
        {"role": "system", "content": "Say hello in Korean."},
        {"role": "user", "content": "hello"}
    ],
    "temperature": 0.1,
    "max_tokens": 2048
}

print(f"URL: {endpoint}")
print(f"Model: {model}")
print(f"Body: {json.dumps(body)}")

req = Request(
    endpoint,
    data=json.dumps(body).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
)

try:
    import ssl
    with urlopen(req, timeout=30, context=ssl._create_unverified_context()) as resp:
        raw_resp = resp.read().decode("utf-8")
        print("\nRaw Response:")
        print(raw_resp)
        payload = json.loads(raw_resp)
        print("\nParsed Choices:")
        print(json.dumps(payload.get("choices"), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error calling GLM: {e}")
