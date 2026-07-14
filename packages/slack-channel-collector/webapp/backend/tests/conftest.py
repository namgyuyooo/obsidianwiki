"""pytest 설정: backend 디렉터리를 import 경로에 추가해 `from app import ...` 가능하게 한다."""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
