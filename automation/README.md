# Automation Workspace

이 디렉터리는 Obsidian 위키 본문과 분리된 자동화 실행 계층이다.

## 목적

- Google Drive 수집기
- 위키화 러너
- 검수/재구조화 러너
- 상태 머신 및 스케줄러
- 런타임 설정과 상태 파일

## 원칙

- `obsidian/Wiki/` 아래에는 실행 코드를 두지 않는다.
- `obsidian/Wiki/`에는 운영 문서, 결과 기록, 증거, 로그만 남긴다.
- 실제 자동화 코드는 모두 `automation/` 아래에 둔다.
- 자동화가 사용하는 상태 파일은 필요 시 `automation/runtime/` 아래에 둔다.
- 위키 반영 대상 경로만 `obsidian/Wiki/`를 읽고 쓴다.

## 제안 구조

```text
automation/
├── README.md
├── drive_wikify/
│   ├── README.md
│   ├── config/
│   │   └── pipeline.example.yaml
│   ├── prompts/
│   ├── runtime/
│   └── src/
```

## 위키와의 경계

- 위키 문서:
  - `obsidian/Wiki/Common/Drive_Wikify_*.md`
- 실행 코드:
  - `automation/drive_wikify/src/`
- 런타임 상태:
  - `automation/drive_wikify/runtime/`
- 설정:
  - `automation/drive_wikify/config/`

이렇게 분리하면 위키는 지식 저장소로 유지되고, 자동화는 교체/테스트/배포 가능한 별도 계층이 된다.
