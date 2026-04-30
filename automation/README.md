# Automation Workspace

이 디렉터리는 Obsidian 위키 본문과 분리된 자동화 실행 계층이다.

## 목적

- Google Drive 수집기
- Slack 수집기
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

## Docker 운영

다른 PC에서도 같은 운영 환경을 쓰려면 repo는 git으로 받고, 인증키와 런타임은 `docker/config`와 Docker volume에 둔다.

```bash
./automation/docker/bootstrap_config.sh
docker compose up --build
```

- Docker env 예시: `automation/drive_wikify/config/drive_wikify.docker.example.env`
- 실제 인증키 위치: `docker/config/drive_wikify.env`
- 실제 rclone 인증 위치: `docker/config/rclone/rclone.conf`
- 런타임/mirror/manifest 위치: Docker volume `wiki_ops_data`

`docker/config`는 git에 올리지 않는다. 인증키를 넣어도 되지만, 이동 시에는 해당 폴더를 별도로 복사한다.

## 위키와의 경계

- 위키 문서:
  - `obsidian/Wiki/Common/Drive_Wikify_*.md`
- 실행 코드:
  - `automation/drive_wikify/src/`
- 런타임 상태:
  - `automation/drive_wikify/runtime/`
  - `automation/wiki_api/runtime/slack_collection_state.json`
- 설정:
  - `automation/drive_wikify/config/`

주 설정 방식은 `.env`이고, `pipeline.example.yaml`은 legacy reference다.
