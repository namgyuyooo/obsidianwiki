# Frontend Integration

## 현재 HTML에서 바꿀 지점

`RTM_고객DB_대시보드.html`은 현재 다음 값을 브라우저 메모리와 `localStorage`에서 관리한다.

- `BASE`
- `BASE_EVTS`
- `AUTO_CINFO`
- `extra.events`
- `userCInfo`

DB 통합 후에는 이 값을 직접 들고 있지 않고 API에서 가져온다.

## 최소 API

개발 서버:

```bash
python3 scripts/serve_api.py data/rtm_customer.db 8765
```

엔드포인트:

- `GET /api/health`
- `GET /api/summary`
- `GET /api/customers?limit=200&offset=0`
- `GET /api/reviews?status=pending`
- `POST /api/reviews/{id}/resolve`

## 프론트 치환 방향

1. `BASE`, `BASE_EVTS`, `AUTO_CINFO`를 제거한다.
2. 초기 로드에서 `/api/customers`와 `/api/summary`를 호출한다.
3. 기존 `rebuild()`는 seed merge 대신 API response를 `recs` 형태로 매핑한다.
4. `syncBtn`은 Slack MCP 직접 호출 대신 backend job 호출로 바꾼다.
5. 정합성 확인 패널을 추가한다.
   - `/api/reviews?status=pending` 표시
   - 승인: `POST /api/reviews/{id}/resolve {"action":"approve"}`
   - 수정 승인: `{"action":"edit","value":"..."}`
   - 거절: `{"action":"reject"}`

## 정합성 UI에서 보여줄 필드

- 근거: `evidence`
- 대상: `entity_type`, `entity_id`
- 필드: `field_name`
- 현재값: `current_value`
- 제안값: `proposed_value`
- 신뢰도: `confidence`

이 화면이 있어야 Slack/GLM 결과가 운영 DB를 조용히 오염시키지 않는다.
