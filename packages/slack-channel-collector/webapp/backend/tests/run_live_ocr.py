"""실제 Slack 명함 이미지 + 실제 GLM Vision을 사용하는 OCR 통합 테스트.

단위 테스트와 달리 provider를 모킹하지 않는다. 관리자 설정/환경변수의 Slack
토큰과 GLM 키를 사용해 전용 명함 채널의 이미지를 내려받고 실제 추론 결과를
검증한다. 원본 개인정보와 토큰은 출력하지 않는다.

예시:
    cd webapp/backend
    set -a; source env; set +a
    .venv/bin/python tests/run_live_ocr.py --provider mcp --also-rotate-90

여러 장이 첨부된 메시지를 지정해 검사:
    .venv/bin/python tests/run_live_ocr.py --ts 1712345678.123 --max-files 10
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import queries, slack_sync, vision  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import get_conn  # noqa: E402


@dataclass
class CheckResult:
    case: str
    file_id: str
    ok: bool
    provider: str
    rotation: int
    confidence: float
    populated_fields: list[str]
    has_email: bool
    has_phone: bool
    expected_email_match: bool | None = None
    error: str = ""


def _image_files(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        f for f in payload.get("files", []) or []
        if isinstance(f, dict) and slack_sync._is_image_file(f)
    ]


def _find_message(conn, channel_id: str, ts: str, min_files: int) -> tuple[str, list[dict[str, Any]]]:
    if ts:
        rows = conn.execute(
            "SELECT message_ts, raw_payload FROM slack_raw_messages "
            "WHERE channel_id=? AND message_ts=?",
            (channel_id, ts),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT message_ts, raw_payload FROM slack_raw_messages "
            "WHERE channel_id=? ORDER BY CAST(message_ts AS REAL) DESC LIMIT 1000",
            (channel_id,),
        ).fetchall()
    fallback: tuple[str, list[dict[str, Any]]] | None = None
    for row in rows:
        try:
            payload = json.loads(row["raw_payload"] or "{}")
        except (ValueError, TypeError):
            continue
        files = _image_files(payload)
        if files and fallback is None:
            fallback = (str(row["message_ts"]), files)
        if len(files) >= min_files:
            return str(row["message_ts"]), files
    if fallback:
        return fallback
    raise RuntimeError("전용 명함 채널에 테스트할 이미지가 없습니다")


def _rotated(image: bytes, degrees: int) -> tuple[bytes, str]:
    source = ImageOps.exif_transpose(Image.open(io.BytesIO(image)))
    output = io.BytesIO()
    source.rotate(-degrees, expand=True).convert("RGB").save(output, "JPEG", quality=94)
    return output.getvalue(), "image/jpeg"


def _synthetic_card() -> tuple[bytes, str, str]:
    """외부 provider에 안전하게 보낼 정답이 알려진 합성 명함."""
    image = Image.new("RGB", (1400, 800), "white")
    draw = ImageDraw.Draw(image)
    font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
    bold_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    try:
        title_font = ImageFont.truetype(bold_path, 86)
        name_font = ImageFont.truetype(bold_path, 64)
        body_font = ImageFont.truetype(font_path, 45)
    except OSError:
        title_font = name_font = body_font = ImageFont.load_default()
    orange = (234, 88, 12)
    dark = (24, 24, 27)
    draw.rectangle((0, 0, 34, 800), fill=orange)
    draw.text((105, 85), "RTM VISION LAB", fill=orange, font=title_font)
    draw.text((105, 250), "JANE DOE", fill=dark, font=name_font)
    draw.text((105, 350), "VISION QA ENGINEER", fill=dark, font=body_font)
    draw.text((105, 470), "jane.ocr@example.com", fill=dark, font=body_font)
    draw.text((105, 550), "+82-10-1234-5678", fill=dark, font=body_font)
    draw.text((105, 650), "www.example.com", fill=(82, 82, 91), font=body_font)
    output = io.BytesIO()
    image.save(output, "JPEG", quality=96)
    return output.getvalue(), "image/jpeg", "jane.ocr@example.com"


def _check(
    image: bytes,
    mime: str,
    *,
    case: str,
    file_id: str,
    filename: str,
    min_confidence: float,
    expected_email: str = "",
) -> CheckResult:
    logs: list[str] = []
    result = vision.ocr_business_card(
        image, mime_type=mime, filename=filename, hint="실제 OCR 기능 테스트", logs=logs
    )
    fields = ("company", "name", "email", "mobile", "phone", "department", "title")
    populated = [key for key in fields if str(result.get(key) or "").strip()]
    confidence = float(result.get("confidence") or 0)
    expected_match = (
        str(result.get("email") or "").strip().lower() == expected_email.lower()
        if expected_email else None
    )
    ok = (
        vision.is_ok(result)
        and confidence >= min_confidence
        and bool({"company", "name", "email", "mobile", "phone"} & set(populated))
        and expected_match is not False
    )
    return CheckResult(
        case=case,
        file_id=file_id[-6:] if file_id else "(none)",
        ok=ok,
        provider=str(result.get("_provider") or ""),
        rotation=int(result.get("_rotation") or 0),
        confidence=round(confidence, 3),
        populated_fields=populated,
        has_email="email" in populated,
        has_phone=bool({"mobile", "phone"} & set(populated)),
        expected_email_match=expected_match,
        error="" if ok else str(result.get("message") or "필드/신뢰도 기준 미달")[:160],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="실제 Slack/GLM Vision 명함 OCR 통합 테스트")
    parser.add_argument("--provider", choices=("auto", "mcp", "rest"), default="auto")
    parser.add_argument("--channel-id", default="")
    parser.add_argument("--ts", default="", help="특정 Slack message_ts")
    parser.add_argument("--file-id", default="", help="특정 Slack file id")
    parser.add_argument("--max-files", type=int, default=3)
    parser.add_argument("--min-files", type=int, default=1, help="가급적 이 장수 이상의 메시지 선택")
    parser.add_argument("--min-confidence", type=float, default=0.45)
    parser.add_argument("--also-rotate-90", action="store_true")
    parser.add_argument(
        "--synthetic", action="store_true",
        help="Slack 대신 개인정보 없는 정답 명함을 생성해 실제 provider를 테스트",
    )
    args = parser.parse_args()

    os.environ["VISION_PROVIDER"] = args.provider
    usable, reason = vision.available()
    if not usable:
        raise RuntimeError(f"Vision provider 미가용: {reason}")

    results: list[CheckResult] = []
    if args.synthetic:
        image, mime, expected_email = _synthetic_card()
        inputs = [("synthetic-original", image, mime)]
        if args.also_rotate_90:
            rotated, rotated_mime = _rotated(image, 90)
            inputs.append(("synthetic-input-rotated-90", rotated, rotated_mime))
        print(f"LIVE OCR: provider={args.provider} synthetic=true cases={len(inputs)}")
        for case, data, current_mime in inputs:
            results.append(_check(
                data, current_mime, case=case, file_id="synthetic",
                filename=f"{case}.jpg", min_confidence=args.min_confidence,
                expected_email=expected_email,
            ))
    else:
        channel_id = args.channel_id or get_settings().business_card_channel_id
        if not queries.is_business_card_channel(channel_id):
            raise RuntimeError("테스트도 지정된 명함수집 채널에서만 실행할 수 있습니다")
        with get_conn() as conn:
            ts, files = _find_message(conn, channel_id, args.ts, max(1, args.min_files))
            if args.file_id:
                files = [f for f in files if str(f.get("id") or "") == args.file_id]
            files = files[: max(1, args.max_files)]
            if not files:
                raise RuntimeError("조건에 맞는 명함 이미지 파일이 없습니다")
            print(f"LIVE OCR: provider={args.provider} files={len(files)} rotated_test={args.also_rotate_90}")
            for index, item in enumerate(files, 1):
                file_id = str(item.get("id") or "")
                image, mime, filename = slack_sync.get_message_image(conn, channel_id, ts, file_id)
                results.append(_check(
                    image, mime, case=f"original-{index}", file_id=file_id,
                    filename=filename, min_confidence=args.min_confidence,
                ))
                if args.also_rotate_90 and index == 1:
                    rotated, rotated_mime = _rotated(image, 90)
                    results.append(_check(
                        rotated, rotated_mime, case="input-rotated-90", file_id=file_id,
                        filename=f"rotated-{filename}", min_confidence=args.min_confidence,
                    ))

    # 개인정보 값은 출력하지 않고 인식 여부와 품질 지표만 출력한다.
    print(json.dumps({"results": [asdict(r) for r in results]}, ensure_ascii=False, indent=2))
    failures = [r for r in results if not r.ok]
    print(f"LIVE OCR RESULT: {'PASS' if not failures else 'FAIL'} ({len(results) - len(failures)}/{len(results)})")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
