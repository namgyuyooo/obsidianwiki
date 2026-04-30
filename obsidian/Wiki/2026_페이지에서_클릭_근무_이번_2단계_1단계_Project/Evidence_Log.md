---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Evidence Log

## Update - 2026-04-30

- Source: flex_내_근무_조회.html
- Extractor: `html_report_parser`
- Heading Candidates: 내 이번 주 근무 북마클릿, 1단계 · 북마클릿 설치, 2단계 · 내 프로필 페이지에서 클릭, 집계 방식, 문제 해결
- Original:
  > Flex 내 근무 · 북마클릿 설치
Flex · Personal
## 내 이번 주 근무 북마클릿
flex.team 탭에서 클릭 한 번으로 이번 주 월요일부터 어제까지 본인의 근무/외근/원격 시간을 집계해 보여줍니다.근무 + 외근 + 휴가 ≥ (5−공휴일)×7h기준 충족 여부를 표시합니다.
## 1단계 · 북마클릿 설치
아래 주황색 버튼을 브라우저북마크 바로 드래그하세요. (북마크 바가 보이지 않으면Ctrl+Shift+B· Mac은⌘+Shift+B)
📊 내 근무 보기
버튼을 클릭하는 게 아니라끌어서북마크 바에 놓으세요.
## 2단계 · 내 프로필 페이지에서 클릭
flex.team 좌측 메뉴에서근무 › 내 근무로 이동
화면에서본인 프로필을 클릭→ 주소창이 아래처럼 바뀝니다
https://flex.team/time-tracking/my-work-record?user_profile_uid=XXXXXXXX
설치한 북마크📊 내 근무 보기클릭
프로필을 클릭한 상태(주소창에user_profile_uid=…포함)에서 실행하면userIdHash가 자동 저장됩니다. 다음부터는 flex.team 어느 페이지에서든 북마크 클릭만 하면 바로 집계 모달이 열립니다.
## 집계 방식
기간— 이번 주 월요일 00:00 ~ 어제 23:59 (오늘 근무는 포함 안 함)
원격근무 자격— 근무+외근+휴가 합계가(5−평일공휴일)×7h이상 (공휴일 없는 주 = 35h)
휴게 차감— Flex에 기록된 REST 블록은 겹치는 근무 구간에서 비율로 차감
공휴일— 회사 공휴일이 있으면 하단에 표시 (자동 기준 조정은 하지 않음)
남은 근무일— 오늘~금요일 중 공휴일 제외한 평일 수
보상휴가 기준 (동적)— (5 − 평일 공휴일수) × 7 + 10h. 공휴일 없는 주는 45h. 초과분 × 1.5 적립.
휴가 집계— 미리 등록된 휴가는 주 전체(미래 포함)를 집계. 등록된 휴가일은 "남은 근무일" 계산에서 제외됩니다.
## 문제 해결
"flex.team 탭에서 실행해주세요"— flex.team 페이지에서 클릭해야 합니다.
조회 실패 HTTP 401/403— Flex 로그인이 만료됐습니다. 다시 로그인 후 재시도.
다른 사람의 uid가 저장됨— 모달 오른쪽 아래uid 재설정클릭 후 본인 프로필 페이지에서 다시 실행.
저장된 uid 수동 초기화— 콘솔에서localStorage.removeItem("myFlexUid")
Flex My Work Bookmarklet v
- Warnings: HTML scripts/styles/svg/canvas were skipped; verify embedded chart-only evidence if needed.
