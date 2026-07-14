# RTM Customer DB — Windows 사내망 Docker 패키지

이 번들은 React UI, FastAPI, Slack 수집기, Vision MCP 런타임과 현재 SQLite 스냅샷을 포함한다.
고객 DB는 이미지가 아니라 `data/` bind mount에 있으며, Slack·GLM 토큰은 관리자 화면에서
입력한 뒤 Docker Secret으로 암호화되어 DB에 저장된다.

## 요구사항

- Windows 10/11 64-bit, 가능하면 RAM 8GB 이상
- Docker Desktop + WSL2, Linux containers 모드
- 사내망 고정 IP 또는 공유기 DHCP 예약
- 관리자 PowerShell
- 서버 절전/최대절전 끄기
- BitLocker 켜기
- 공유기 포트포워딩, DMZ, UPnP 끄기

로컬 Ollama는 저사양 서버에서 함께 실행하지 않는 것을 권장한다. GLM Cloud 또는 별도 AI 서버를 사용한다.

## 설치

압축을 해제하면 Docker 설치 파일, 앱 소스, 현재 DB가 모두 한 폴더에 있다.

1. 관리자 PowerShell에서 Docker Desktop을 설치한다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\1-Install-Docker.ps1
```

2. Windows를 재시작하고 Docker Desktop을 한 번 실행한다.

3. RTM 서버를 설치한다.

```powershell
.\scripts\Install-RTM.ps1 -ServerIP 192.168.0.20
```

Docker Desktop 상업적 이용 조건은 조직 규모와 매출에 따라 유료 구독이 필요할 수 있으므로
Docker의 현재 라이선스 조건을 사내에서 확인한다.

설치 후 `https://192.168.0.20`으로 접속한다. `certs/rtm-local-root.crt`를 접속할 PC의
`신뢰할 수 있는 루트 인증 기관`에 설치해야 브라우저 인증서 경고가 사라진다.

관리자 패널에서 Slack Bot Token, GLM/AI URL·모델·API Key를 입력하고 각각 연결 테스트를 실행한다.
최초 관리자 아이디와 임의 비밀번호는 `secrets/INITIAL_ADMIN.txt`에 생성된다. 첫 로그인 후
사용자·권한 관리에서 비밀번호를 변경하고 이 파일을 삭제한다. 패키지 DB에 있던 기존 로그인
토큰은 설치 과정에서 모두 폐기된다.

## 보안 구조

- FastAPI 8765 포트는 Docker 내부에서만 노출된다.
- 호스트에는 Caddy HTTPS 443만 열리고 RFC1918 사설 IP만 허용한다.
- Windows 방화벽 규칙은 `Private` 네트워크와 `LocalSubnet`으로 제한된다.
- 앱은 non-root, read-only root filesystem, 모든 Linux capability 제거 상태로 실행된다.
- 고객·Slack·관리 API는 백엔드 전역 인증 미들웨어로 보호된다.
- Swagger/OpenAPI 문서는 운영 모드에서 비활성화된다.
- 연동 토큰은 DB에서 Fernet 암호화되며 키는 `secrets/rtm_secret_key` Docker Secret에 분리된다.
- 암호화 키 파일 ACL은 설치 사용자와 SYSTEM만 허용한다.
- 현재 DB는 `data/`, 암호화 백업은 `backups/`에 저장된다.

`secrets/rtm_secret_key`를 잃으면 관리자 패널에 저장한 토큰과 암호화 백업을 복호화할 수 없다.
DB 백업과 별도로 이 파일을 BitLocker로 보호된 USB 등 안전한 장소에 보관한다.

## 운영 명령

```powershell
docker compose --env-file server.env ps
docker compose --env-file server.env up -d
docker compose --env-file server.env down
.\scripts\Status-RTM.ps1
.\scripts\Backup-Now.ps1
.\scripts\Restore-Backup.ps1 .\backups\rtm-customer-YYYYMMDDTHHMMSSZ.db.fernet
```

자동 백업은 24시간마다 실행되며 최근 14개를 유지한다. `backups/`와 암호화 키를 같은 디스크에만
두지 말고 정기적으로 별도 저장장치에 복사한다. 라이브 `data/rtm_customer.db`를 OneDrive에서
직접 동기화하지 않는다.

## 접속 범위 강화

게스트 Wi-Fi가 같은 서브넷을 사용한다면 설치 스크립트가 만든 방화벽 규칙의 `RemoteAddress`를
승인된 PC IP 목록으로 좁힌다. 공유기에서 외부 포트포워딩이 없는지도 반드시 확인한다.
