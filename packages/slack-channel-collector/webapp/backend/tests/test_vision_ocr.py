"""명함인식(OCR) 파이프라인 단위 테스트.

네트워크·Slack·실제 비전 provider 없이, 결정적(deterministic) 로직만 검증한다.
provider 호출은 모두 monkeypatch로 대체하므로 CI/로컬 어디서나 재현 가능하다.

실행:
    cd webapp/backend
    pytest tests/test_vision_ocr.py -v
"""
from __future__ import annotations

import io
import json

import pytest
from PIL import Image

from app import slack_sync, vision


# ── 이미지 헬퍼 ──────────────────────────────────────────────────────────────
def _img_bytes(w: int, h: int, fmt: str = "JPEG") -> bytes:
    """유효한 이미지 바이트 생성 (Image.open이 통과하도록)."""
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (240, 240, 240)).save(buf, format=fmt)
    return buf.getvalue()


LANDSCAPE = _img_bytes(300, 180)          # 가로 명함 (정방향)
PORTRAIT = _img_bytes(180, 320)           # 세로 사진 (회전 재시도 유발)

RICH_CARD = {
    "company": "RTM", "name": "홍길동", "email": "hong@rtm.ai",
    "mobile": "010-1234-5678", "phone": "02-555-0000",
    "department": "R&D", "title": "CTO", "confidence": 0.92,
}
POOR_CARD = {"name": "홍", "confidence": 0.3}


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch):
    """각 테스트가 VISION_PROVIDER를 명시적으로 설정하도록 기본값 정리."""
    monkeypatch.delenv("VISION_PROVIDER", raising=False)
    yield


# ── provider 라우팅 / 가용성 ─────────────────────────────────────────────────
@pytest.mark.parametrize(
    "env,expected",
    [
        ("auto", ["mcp", "rest"]),
        ("mcp", ["mcp"]),
        ("rest", ["rest"]),
        ("off", []),
        ("garbage", ["mcp", "rest"]),  # 알 수 없는 값 → 안전 기본
    ],
)
def test_order_routing(monkeypatch, env, expected):
    monkeypatch.setenv("VISION_PROVIDER", env)
    assert vision._order() == expected


def test_available_off(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "off")
    ok, reason = vision.available()
    assert ok is False and reason == "VISION_PROVIDER=off"


def test_available_true_when_probe_passes(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "auto")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: True)
    monkeypatch.setattr(vision.glm, "is_configured", lambda: False)
    ok, reason = vision.available()
    assert ok is True and reason == ""


def test_available_false_lists_reasons(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "mcp")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: False)
    monkeypatch.setattr(vision.zai_vision_mcp, "unavailable_reason", lambda: "no token")
    ok, reason = vision.available()
    assert ok is False and "MCP(" in reason


def test_is_ok():
    assert vision.is_ok({"_mode": "ok"}) is True
    assert vision.is_ok({"_mode": "glm"}) is False
    assert vision.is_ok({}) is False


# ── ocr_business_card 코어 ───────────────────────────────────────────────────
def test_ocr_off_returns_off_mode(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "off")
    res = vision.ocr_business_card(LANDSCAPE, mime_type="image/jpeg")
    assert res["_mode"] == "off"


def test_ocr_unavailable_when_no_provider(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "mcp")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: False)
    monkeypatch.setattr(vision.zai_vision_mcp, "unavailable_reason", lambda: "no token")
    res = vision.ocr_business_card(LANDSCAPE, mime_type="image/jpeg")
    assert vision.is_ok(res) is False
    assert res["_mode"] == "unavailable"


def test_ocr_mcp_success_maps_mode_and_provider(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "mcp")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: True)
    monkeypatch.setattr(
        vision.zai_vision_mcp, "analyze_business_card",
        lambda data, **kw: {"_mode": "glm_mcp", **RICH_CARD},
    )
    res = vision.ocr_business_card(LANDSCAPE, mime_type="image/jpeg")
    assert vision.is_ok(res) is True
    assert res["_provider"] == "mcp"
    assert res["_rotation"] == 0
    assert res["email"] == "hong@rtm.ai"


def test_ocr_falls_back_from_mcp_to_rest(monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER", "auto")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: True)
    monkeypatch.setattr(vision.glm, "is_configured", lambda: True)
    # MCP는 실패 모드를 돌려주고, REST가 성공.
    monkeypatch.setattr(
        vision.zai_vision_mcp, "analyze_business_card",
        lambda data, **kw: {"_mode": "error", "message": "mcp down"},
    )
    monkeypatch.setattr(
        vision.glm, "extract_business_card_image",
        lambda data, **kw: {"_mode": "glm", **RICH_CARD},
    )
    res = vision.ocr_business_card(LANDSCAPE, mime_type="image/jpeg")
    assert vision.is_ok(res) is True
    assert res["_provider"] == "rest"


def test_ocr_portrait_auto_rotation_picks_best(monkeypatch):
    """세로 저품질 결과 → 90/270° 재시도 후 더 풍부한 결과 채택."""
    monkeypatch.setenv("VISION_PROVIDER", "mcp")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: True)
    calls = {"n": 0}

    def fake_ocr(data, **kw):
        calls["n"] += 1
        # 첫 호출(0°)은 저품질 → 재시도 유발, 이후 회전 호출은 고품질.
        if calls["n"] == 1:
            return {"_mode": "glm_mcp", **POOR_CARD}
        return {"_mode": "glm_mcp", **RICH_CARD}

    monkeypatch.setattr(vision.zai_vision_mcp, "analyze_business_card", fake_ocr)
    res = vision.ocr_business_card(PORTRAIT, mime_type="image/jpeg")
    assert vision.is_ok(res) is True
    assert calls["n"] >= 2                 # 회전 재시도가 실제로 일어남
    assert res["_rotation"] in (90, 270)   # 회전본이 채택됨
    assert res["email"] == "hong@rtm.ai"


def test_ocr_survives_invalid_image_bytes(monkeypatch):
    """방향 정규화가 실패해도(깨진 바이트) provider 원본으로 진행."""
    monkeypatch.setenv("VISION_PROVIDER", "mcp")
    monkeypatch.setattr(vision.zai_vision_mcp, "is_available", lambda: True)
    monkeypatch.setattr(
        vision.zai_vision_mcp, "analyze_business_card",
        lambda data, **kw: {"_mode": "glm_mcp", **RICH_CARD},
    )
    res = vision.ocr_business_card(b"not-an-image", mime_type="image/jpeg")
    assert vision.is_ok(res) is True


# ── slack_sync 결정적 헬퍼 ───────────────────────────────────────────────────
@pytest.mark.parametrize(
    "item,expected",
    [
        ({"mimetype": "image/png"}, True),
        ({"filetype": "jpg"}, True),
        ({"name": "card.WEBP"}, True),
        ({"title": "scan.jpeg"}, True),
        ({"mimetype": "application/pdf", "name": "doc.pdf"}, False),
        ({}, False),
    ],
)
def test_is_image_file(item, expected):
    assert slack_sync._is_image_file(item) is expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("*볼드제거*", "볼드제거"),
        ("  공백정리  ", "공백정리"),
        ("줄바꿈\r제거", "줄바꿈제거"),
        ("", ""),
        ("*", "*"),  # 길이 1은 볼드로 보지 않음
    ],
)
def test_clean_field_value(raw, expected):
    assert slack_sync._clean_field_value(raw) == expected


# ── ocr_message_cards 필드 매핑 (가짜 DB) ─────────────────────────────────────
class _FakeCursor:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeConn:
    """SELECT는 preset row를 반환, INSERT 등은 무시하는 최소 커넥션."""
    def __init__(self, row):
        self._row = row
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append(sql.strip().split()[0].upper())
        return _FakeCursor(self._row if sql.strip().upper().startswith("SELECT") else None)


def _payload_row(files):
    return {"raw_payload": json.dumps({"files": files, "text": "명함 힌트"}), "text": "명함 힌트"}


def test_ocr_message_cards_not_found():
    conn = _FakeConn(None)
    res = slack_sync.ocr_message_cards(conn, "C1", "1.1")
    assert res["ok"] is False and "원문" in res["message"]


def test_ocr_message_cards_no_image(monkeypatch):
    conn = _FakeConn(_payload_row([{"mimetype": "application/pdf", "name": "x.pdf"}]))
    res = slack_sync.ocr_message_cards(conn, "C1", "1.1")
    assert res["ok"] is False and "이미지" in res["message"]


def test_ocr_message_cards_vision_unavailable(monkeypatch):
    conn = _FakeConn(_payload_row([{"mimetype": "image/jpeg", "id": "F1", "name": "c.jpg"}]))
    monkeypatch.setattr(slack_sync.vision, "available", lambda: (False, "no backend"))
    res = slack_sync.ocr_message_cards(conn, "C1", "1.1")
    assert res["ok"] is False and "미가용" in res["message"]


def test_ocr_message_cards_maps_fields(monkeypatch):
    conn = _FakeConn(_payload_row([{"mimetype": "image/jpeg", "id": "F1", "name": "c.jpg"}]))
    monkeypatch.setattr(slack_sync.vision, "available", lambda: (True, ""))
    monkeypatch.setattr(slack_sync, "_download_slack_file", lambda f: (b"img", "image/jpeg"))
    monkeypatch.setattr(
        slack_sync.vision, "ocr_business_card",
        lambda *a, **kw: {
            "_mode": "ok", "_provider": "mcp", "_rotation": 0, "confidence": 0.8,
            "company": "  RTM ", "name": " 홍길동 ", "email": "hong@rtm.ai",
            "mobile": "010-1234-5678", "phone": "",  # phone 비면 mobile로 대체
            "department": "R&D", "title": "CTO", "evidence": "명함 상단",
        },
    )
    res = slack_sync.ocr_message_cards(conn, "C1", "1.1")
    assert res["ok"] is True
    card = res["cards"][0]
    assert card["ok"] is True
    assert card["fields"]["company"] == "RTM"          # strip
    assert card["fields"]["name"] == "홍길동"           # strip
    assert card["fields"]["phone"] == "010-1234-5678"  # mobile fallback
    assert card["provider"] == "mcp"
    assert "INSERT" in conn.executed                    # 결과 캐시 기록


def test_ocr_message_cards_ocr_failure_marks_card(monkeypatch):
    conn = _FakeConn(_payload_row([{"mimetype": "image/jpeg", "id": "F1", "name": "c.jpg"}]))
    monkeypatch.setattr(slack_sync.vision, "available", lambda: (True, ""))
    monkeypatch.setattr(slack_sync, "_download_slack_file", lambda f: (b"img", "image/jpeg"))
    monkeypatch.setattr(
        slack_sync.vision, "ocr_business_card",
        lambda *a, **kw: {"_mode": "unavailable", "message": "provider 없음"},
    )
    res = slack_sync.ocr_message_cards(conn, "C1", "1.1")
    assert res["ok"] is False
    assert res["cards"][0]["ok"] is False
