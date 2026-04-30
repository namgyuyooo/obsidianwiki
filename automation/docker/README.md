# Wiki Ops Docker 운영 가이드

이 Docker 구성의 목적은 위키 repo는 git으로 관리하고, 인증키와 실행 로그는 컨테이너 외부에 둔 채 다른 PC에서도 같은 방식으로 실행하는 것입니다.

## 구조

- `/workspace/wiki-repo`: git으로 관리되는 이 repo가 마운트됩니다.
- `/config/drive_wikify.env`: GLM, OpenClaw, Paperclip, rclone 실행 설정입니다.
- `/config/rclone/rclone.conf`: Google Drive rclone 인증 설정입니다.
- `/data`: mirror, manifest, run log, API runtime 상태가 저장됩니다.

`docker/config`는 git ignore 대상입니다. 사용자가 인증키를 넣어도 repo에는 올라가지 않습니다.

## 최초 설정

```bash
cd /Users/rtm/Documents/GitHub/Obsidian_wiki/obsidianwiki
./automation/docker/bootstrap_config.sh
```

위 스크립트는 기존 `automation/drive_wikify/config/.env`와 `~/.config/rclone/rclone.conf`를 `docker/config`로 복사합니다. 기존 파일이 없으면 Docker용 예시 파일을 생성합니다.

## 실행

```bash
docker compose up --build
```

브라우저에서 `http://127.0.0.1:8787`을 열면 됩니다.

## 다른 PC로 이동

1. 새 PC에 repo를 clone합니다.
2. 기존 PC의 `docker/config/drive_wikify.env`와 `docker/config/rclone/rclone.conf`를 새 PC의 같은 위치로 복사합니다.
3. 기존 실행 상태까지 옮기려면 Docker volume `wiki_ops_data`를 백업하거나, 필요한 경우 `/data`를 bind mount로 바꿉니다.
4. `docker compose up --build`를 실행합니다.

## 안전 규칙

- 원본 Google Drive 삭제는 지원하지 않습니다.
- `DRIVE_DELETE_SOURCE=true`는 코드에서 즉시 실패합니다.
- rclone은 `copy` 중심으로만 운용하고, 원본 Drive의 `sync`, `delete`, `purge`는 제품 표면에 두지 않습니다.
- `CLEANUP_LOCAL_MIRROR=true`는 로컬 mirror 정리만 의미합니다.

## 운영 확인

```bash
docker compose ps
docker compose logs -f wiki-ops
docker compose exec wiki-ops rclone lsd gdrive: --max-depth 1
docker compose exec wiki-ops python3 -m drive_wikify.cli rclone-copy --dry-run
```

Drive 수집 실행은 기본 30분 제한을 따릅니다. 단, `build-manifest`, `run`, 상태 조회, 위키 검색처럼 rclone copy가 아닌 작업은 30분 자동 제한의 대상이 아닙니다.
