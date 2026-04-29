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
- 원본 Google Drive는 절대 삭제하지 않는다.
- 자동 정리는 `local mirror`에만 적용한다.
- Drive의 `Github`/`GitHub`/`Obsidian_wiki` 계열 폴더는 본 위키 업로드본이 섞일 수 있으므로 수집 대상에서 제외한다.

## 제안 구조

```text
automation/
├── README.md
├── drive_wikify/
│   ├── README.md
│   ├── config/
│   │   ├── drive_wikify.example.env
│   │   ├── rclone.example.env
│   │   └── pipeline.example.yaml
│   ├── prompts/
│   ├── runtime/
│   └── src/
├── wiki_api/
└── wiki_frontend/
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

주 설정 방식은 `.env`이고, `pipeline.example.yaml`은 legacy reference다.
