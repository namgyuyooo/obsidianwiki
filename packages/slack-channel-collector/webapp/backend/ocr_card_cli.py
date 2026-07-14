#!/usr/bin/env python3
"""명함인식(OCR) 라이브 테스트 CLI.

실제 설정된 비전 provider(MCP/REST)로 명함 이미지를 인식해 추출 필드를 출력한다.
단위 테스트(tests/test_vision_ocr.py)와 달리 이건 진짜 provider를 호출한다 →
서버와 동일한 .env(VISION_PROVIDER, GLM_API_KEY 등)가 필요하다.

사용법:
    cd webapp/backend
    # 1) 로컬 이미지 파일로 테스트
    python ocr_card_cli.py path/to/card.jpg
    python ocr_card_cli.py card.jpg --hint "전시회에서 받은 명함"

    # 2) DB에 저장된 슬랙 메시지의 명함으로 테스트 (원문 뷰어와 동일 경로)
    RTM_CUSTOMER_DB=../../customer-db/data/rtm_customer.db \
      python ocr_card_cli.py --slack <channel_id> <message_ts>

환경변수:
    VISION_PROVIDER   auto(기본)|mcp|rest|off
    GLM_API_URL/KEY   REST(OpenAI 호환) provider 사용 시
    RTM_CUSTOMER_DB   --slack 모드에서 원문을 읽을 DB 경로
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

# `python ocr_card_cli.py`를 backend 디렉터리에서 실행하는 전제. app 패키지 import.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# backend 디렉터리의 .env 또는 env 파일 로드
backend_dir = Path(__file__).resolve().parent
for env_name in (".env", "env"):
    env_path = backend_dir / env_name
    if env_path.is_file():
        load_dotenv(env_path)

from app import vision  # noqa: E402


def _print_result(source: str, ocr: dict) -> bool:
    ok = vision.is_ok(ocr)
    print(f"\n=== 명함 OCR 결과: {source} ===")
    print(f"  성공 여부   : {'✅ 성공' if ok else '❌ 실패'}")
    if not ok:
        print(f"  사유        : {ocr.get('message', '알 수 없음')}  (_mode={ocr.get('_mode')})")
        return False
    print(f"  provider    : {ocr.get('_provider', '-')}   회전: {ocr.get('_rotation', 0)}°")
    print(f"  신뢰도      : {ocr.get('confidence', 0)}")
    print("  ── 추출 필드 ──")
    for label, key in [
        ("회사", "company"), ("이름", "name"), ("이메일", "email"),
        ("부서", "department"), ("직급", "title"),
        ("휴대폰", "mobile"), ("전화", "phone"),
    ]:
        val = str(ocr.get(key) or "").strip()
        if val:
            print(f"    {label:<6}: {val}")
    if ocr.get("evidence"):
        print(f"  근거        : {str(ocr['evidence'])[:120]}")
    return True


def _from_file(path: Path, hint: str) -> int:
    if not path.exists():
        print(f"파일을 찾을 수 없습니다: {path}", file=sys.stderr)
        return 2
    ok_backend, reason = vision.available()
    if not ok_backend:
        print(f"⚠ OCR 백엔드 미가용: {reason} (VISION_PROVIDER={vision.provider()})", file=sys.stderr)
        return 3
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    logs: list[str] = []
    ocr = vision.ocr_business_card(
        path.read_bytes(), mime_type=mime, filename=path.name, hint=hint, logs=logs
    )
    ok = _print_result(path.name, ocr)
    return 0 if ok else 1


def _from_slack(channel_id: str, ts: str) -> int:
    from app.db import get_conn
    from app import slack_sync
    with get_conn() as conn:
        result = slack_sync.ocr_message_cards(conn, channel_id, ts)
    if not result.get("ok"):
        print(f"❌ {result.get('message', 'OCR 실패')}", file=sys.stderr)
        # 카드별 실패 사유도 노출
        for c in result.get("cards", []):
            if not c.get("ok"):
                print(f"   - {c.get('file_name')}: {c.get('message')}", file=sys.stderr)
        return 1
    for c in result.get("cards", []):
        fields = c.get("fields", {})
        ocr_like = {
            "_mode": "ok" if c.get("ok") else "fail",
            "_provider": c.get("provider"), "_rotation": c.get("rotation", 0),
            "confidence": c.get("confidence"), "evidence": c.get("evidence"),
            **fields,
        }
        _print_result(c.get("file_name", "명함"), ocr_like)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="명함 OCR 라이브 테스트")
    p.add_argument("image", nargs="?", help="명함 이미지 파일 경로")
    p.add_argument("--hint", default="", help="OCR 힌트(예: 메시지 텍스트)")
    p.add_argument("--slack", nargs=2, metavar=("CHANNEL_ID", "TS"),
                   help="DB에 저장된 슬랙 메시지의 명함으로 테스트")
    args = p.parse_args(argv)

    print(f"VISION_PROVIDER={vision.provider()}  ·  가용={vision.available()}")
    if args.slack:
        return _from_slack(args.slack[0], args.slack[1])
    if args.image:
        return _from_file(Path(args.image).expanduser(), args.hint)
    p.error("이미지 파일 경로 또는 --slack CHANNEL_ID TS 중 하나가 필요합니다")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
