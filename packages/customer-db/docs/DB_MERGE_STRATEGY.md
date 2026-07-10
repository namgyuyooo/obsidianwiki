# 기존 DB 테이블과의 병합 방안

Slack 수집(webapp `/api/sync`)과 수기 입력이 **이미 구축된 `rtm_customer.db`** 에
새 데이터를 넣을 때, 중복을 만들지 않고 기존 값을 지키면서 병합하는 규칙을 정리한다.

## 1. 매칭 키 (무엇을 "같은 것"으로 볼지)

| 엔터티 | 매칭 키 | 정규화 |
| --- | --- | --- |
| 회사 `companies` | `canonical_key` (UNIQUE) | `_norm_company_key()` — `(주)/㈜/주식회사` 제거, 공백·괄호 제거, 소문자화, `CO_ALIAS` 적용 |
| 담당자 `contacts` | `email` (UNIQUE) | 소문자 trim |
| Slack 원문 `slack_raw_messages` | `(channel_id, message_ts)` (UNIQUE) | — |
| 관심솔루션/소스 링크 | `(contact_id, solution_id)` / `(contact_id, source_id)` | `INSERT OR IGNORE` |

같은 키면 **UPDATE**, 없으면 **INSERT**. 이 UNIQUE 제약이 병합의 1차 방어선이다.

## 2. 업서트 규칙 (덮어쓰지 않는 병합)

`apply_contact_event()` 의 동작:

- **신규 이메일** → `contacts` INSERT (seed_source = `slack_relate`/`slack_featpaper`/`manual`).
- **기존 이메일** → 빈 칸만 채우고(`name/department/title/phone`), 절대 기존 값을 덮어쓰지 않음.
  `activity_count += 1`, `last_seen = MAX(...)`, `inquiry_summary` 는 append.
- 회사는 `_upsert_company()` 로 canonical_key 매칭 → 있으면 재사용, 없으면 생성.
- 소스/관심솔루션은 `INSERT OR IGNORE` 로 중복 없이 누적.

즉 **추가·보강은 자동, 기존 값 변경은 보류**가 원칙이다.

## 3. 충돌·불확실 → 정합성 확인 큐

자동 확정하지 않고 `consistency_reviews` 로 보내는 경우:

- 기존 DB 값과 **다른** 제안값 (GLM/크로스팀 회사 정보 업데이트) → 필드별 `company_update` 리뷰
  (현재값 ↔ 제안값 비교).
- **새 회사** (설정 `require_review_for_new_company=true`) 또는 크로스팀 `확인상태: 확인 필요/추정`
  → `new_company` 리뷰 (담당자는 회사 미연결 상태로 생성, 리뷰에서 연결/등록).
- 낮은 confidence (GLM `< 0.85`) → 필드 확인 리뷰.

리뷰 해결 시 **본 테이블에 write-through**:
`approve/edit` → 해당 컬럼 UPDATE, `link_existing` → `contacts.company_id` 연결,
`register_new` → 회사 생성 후 연결, `reject` → 반영 안 함.

## 4. 복수 고객사·복수 담당자 (모두에게 기록)

한 메시지에 회사·담당자가 여러 개면 **관련된 모두**에 기록한다.

- `회사명: A, B` + `관련사: C` → `[A, B, C]` 로 분해(`_split_companies`).
- `고객 담당자:` 목록의 각 담당자 → 각각 `contacts` 업서트 + 개별 활동 기록.
- 담당자는 주 회사(primary = 첫 회사)에 연결하고, **모든 회사**에는 회사 단위 활동을 남겨
  각 회사 타임라인에서 동일 접점을 볼 수 있게 한다.
- 담당자가 특정 회사 소속임이 분명하면(가이드 권장) 메시지를 회사별 블록으로 나눠 작성.

`고객사 뷰`/회사 상세는 `company_id` 로 묶여 **그 회사의 모든 담당자**(부서→담당자 계층)를 보여준다.

## 5. 채널 전략 → 테이블 매핑

| 채널 | 전략 | 파싱 → 반영 |
| --- | --- | --- |
| #sales-inbound | inbound | 릴레잇/피트페이퍼 훅 → `contacts`(신규 리드) + `activities` + `contact_sources` |
| #tf_cross_team_sales | cross_team | `[신규 리드]`→리드 / `[고객 활동]`→`activities`(방문·콜·견적…) / `[회사 정보 업데이트]`→`company_update` 리뷰 |

두 채널 모두 원문·permalink·스레드 댓글을 `slack_raw_messages` 에 보존한다.

## 6. 재실행 안전성 (idempotency)

- 채널별 `channel_state[channel_id] = last_synced_ts` 로 이미 처리한 메시지는 건너뜀.
- `slack_raw_messages` 는 `(channel_id, message_ts)` UNIQUE → 원문 중복 저장 없음.
- 소스/관심 링크는 `INSERT OR IGNORE`.
- 따라서 같은 export/기간을 다시 동기화해도 중복 리드·중복 링크가 생기지 않는다.
  (단, 회사 단위 활동 로그는 append 성격이므로, 완전 재적재 시 활동 행은 늘 수 있음.)

## 7. 운영 권장

1. 최초 1회는 `sync_limit` 를 크게(또는 lookback 확대) 잡아 백필, 이후 증분.
2. `require_review_for_new_company=true` 로 두면 새 회사가 조용히 늘지 않고 검수 큐로 모임.
3. 회사명 표기 흔들림(예: `삼성전자` vs `삼성전자(통합)`)은 `company_aliases` /
   `CO_ALIAS` 에 등록해 canonical_key 를 통일.
4. 정기 lint: 리뷰 큐 소진, 회사 미연결 담당자(`company_id IS NULL`) 점검.
