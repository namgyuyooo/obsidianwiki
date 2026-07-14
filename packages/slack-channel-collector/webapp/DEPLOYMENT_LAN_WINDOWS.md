# RTM 고객 DB 대시보드 — 사내 LAN 배포 계획 (Windows)

목표: 여유 Windows PC 한 대를 **사내 와이파이에서만 접근 가능한 로컬 서버**로 만들어, RTM 고객 DB 대시보드(FastAPI + React)를 상시 구동한다. 공개 인터넷에는 절대 노출하지 않는다.

이 문서는 "무엇을, 왜, 어떤 순서로" 하는지의 계획이다. 실제 명령/파일 예시는 각 절에 포함했다.

---

## 0. 위협 모델 (무엇으로부터 보호하나)

사내 와이파이라 해도 다음을 전제로 설계한다.

- 같은 와이파이에 붙은 **다른 기기(방문자 노트북, 개인폰, IoT)** 는 신뢰하지 않는다 → 인증·HTTPS 필요.
- 서버 PC 자체의 **분실/도난** 가능성 → 디스크 암호화·화면 잠금.
- 실수로 **공유기 포트포워딩**이 켜져 외부에 뚫리는 상황 → 방화벽·바인딩으로 이중 차단.

즉 "LAN이니까 인증 없이 열자"가 아니라, LAN 안에서도 최소권한을 유지한다. 다행히 앱에는 이미 계정·역할·권한 체계가 있으므로 그대로 활용한다.

---

## 1. 네트워크 위치 고정

서버 PC의 접근 주소가 바뀌면 안 되므로 **고정 사설 IP**를 준다.

- 공유기 DHCP 예약(권장): 서버 PC의 MAC에 항상 같은 IP(예: `192.168.0.50`)를 배정.
- 또는 Windows에서 수동 정적 IP 설정.
- 접속은 IP 또는 호스트명(`http://rtm-db.local`)으로. mDNS(Bonjour)가 되면 호스트명이 편하다.

와이파이 대역(예: `192.168.0.0/24`)을 기록해 둔다 — 방화벽 규칙에서 이 대역만 허용한다.

**공유기에서 이 PC로의 포트포워딩·DMZ·UPnP 자동개방이 꺼져 있는지 반드시 확인**한다. 이 한 가지가 "사내 전용"의 핵심이다.

---

## 2. 런타임 준비

서버 PC에 설치할 것:

- **Python 3.11+** (현재 코드가 쓰는 문법 호환), pip.
- **Node.js 20 LTS** (프론트 빌드용).
- **Git** (업데이트 배포용).

리포지토리를 배치하고 백엔드 의존성·프론트 빌드를 한 번 수행한다.

```
git clone <repo> C:\rtm\obsidianwiki
cd C:\rtm\obsidianwiki\packages\slack-channel-collector\webapp\frontend
npm ci && npm run build          # dist/ 생성 (백엔드가 이 dist를 서빙)
cd ..\backend
py -m venv .venv & .venv\Scripts\pip install -r requirements.txt
```

백엔드는 `frontend/dist`를 정적 서빙하므로 **프론트를 고칠 때마다 `npm run build` 후 서버 재시작**이 필요하다(개발 중이 아니라면 Vite dev 서버는 안 띄운다).

---

## 3. 설정과 비밀값 (.env)

`backend\.env` 파일에 환경변수를 둔다. 이 파일은 **git에 커밋하지 않는다**(`.gitignore` 확인).

핵심 값:

```
RTM_CUSTOMER_DB=C:\rtm\data\rtm_customer.db
RTM_ADMIN_API_KEY=<길고 무작위한 32자+ 문자열>
RTM_ADMIN_EMAIL=admin@rtm.ai
RTM_CORS_ORIGINS=https://rtm-db.local
# Slack/GLM 토큰은 앱 화면(동기화 설정)에서 저장 → DB(app_runtime_settings)에 보관
```

주의사항:

- `RTM_ADMIN_API_KEY`는 사실상 마스터 키다. 길게·무작위로 만들고, 아는 사람을 최소화한다. 일상 사용은 이 키가 아니라 **개인 계정 로그인**으로 하고, 관리 키는 초기 셋업·복구용으로만 쓴다.
- Slack 봇 토큰·GLM API 키는 코드/깃이 아니라 실행 중 DB에 저장된다. 따라서 **DB 파일 보호가 곧 비밀값 보호**다(4절, 6절).
- CORS는 실제 접속 도메인만 허용으로 좁힌다(개발용 localhost는 운영에서 제거).

---

## 4. HTTPS — 와이파이 도청 차단

로그인 토큰·API 키가 `X-RTM-API-Key` 헤더로 오간다. 평문 HTTP면 같은 와이파이에서 가로챌 수 있다. **LAN이라도 HTTPS를 쓴다.**

가장 간단한 방법은 **Caddy**를 로컬 리버스 프록시로 두는 것이다(Windows 단일 실행파일, 내부 인증서 자동 발급).

```
# Caddyfile
rtm-db.local {
    reverse_proxy 127.0.0.1:8765
}
```

- Caddy가 443에서 HTTPS를 종단하고, 뒤의 uvicorn(8765, 루프백)으로 넘긴다.
- Caddy의 내부 CA 루트 인증서를 각 사용자 PC/폰에 **신뢰 등록**하면 브라우저 경고가 사라진다(사내 기기 수가 적으니 수동 배포로 충분).
- 대안: `mkcert`로 사내용 인증서 발급 후 nginx/uvicorn에 직접 물리기. Caddy 쪽이 운영이 단순하다.

이 구성에서 **uvicorn은 `127.0.0.1`(루프백)만 바인딩**하고, 외부 노출은 Caddy가 담당한다 → 앱 서버가 실수로 열릴 여지를 없앤다.

---

## 5. 방화벽 — 와이파이 대역만 허용

Windows 방화벽에서 인바운드를 최소화한다.

- 허용: TCP **443**(Caddy), 원격지 범위를 **와이파이 대역(예 `192.168.0.0/24`)으로 제한**.
- 차단(기본): 8765는 외부에서 접근 불가(루프백만). 방화벽에서도 8765 인바운드는 열지 않는다.
- 그 외 불필요한 인바운드 서비스는 끈다.

예:

```
netsh advfirewall firewall add rule name="RTM-DB HTTPS (LAN only)" ^
  dir=in action=allow protocol=TCP localport=443 remoteip=192.168.0.0/24
```

---

## 6. 데이터 보호와 백업

- **BitLocker**로 디스크 암호화 → PC 분실 시 DB·토큰 유출 방지.
- DB 파일(`rtm_customer.db`)과 WAL 동반 파일(`-wal`, `-shm`)을 함께 백업한다. 앱은 이미 WAL 모드다.
- **정기 백업**: 매일 새벽 작업 스케줄러로 `.db`를 안전 위치(사내 NAS 등)로 복사. 온라인 백업이 필요하면 `sqlite3 .backup` 또는 `VACUUM INTO`를 쓴다(WAL 중 안전).
- 백업본에도 접근 통제를 둔다(백업이 곧 원본과 같은 민감도).
- 서버 PC의 OS 계정은 **관리자와 분리된 표준 계정**으로 앱을 돌리고, 자동 로그인·화면잠금 정책을 설정한다.

간단 백업 예:

```
sqlite3 C:\rtm\data\rtm_customer.db ".backup 'D:\backups\rtm_%date%.db'"
```

---

## 7. 상시 구동 — 서비스로 등록

PC를 켜면 자동으로 뜨고, 죽으면 재시작되도록 한다. `run.sh`(bash)는 개발용이므로 Windows에서는 서비스로 만든다.

권장: **NSSM**(Non-Sucking Service Manager)로 uvicorn과 Caddy를 각각 서비스 등록.

```
nssm install rtm-db "C:\rtm\...\backend\.venv\Scripts\python.exe" ^
  "-m" "uvicorn" "app.main:app" "--host" "127.0.0.1" "--port" "8765"
nssm set rtm-db AppDirectory C:\rtm\...\backend
nssm set rtm-db AppEnvironmentExtra RTM_CUSTOMER_DB=C:\rtm\data\rtm_customer.db
nssm install rtm-caddy "C:\rtm\caddy.exe" run --config C:\rtm\Caddyfile
```

- `--reload`은 **운영에서 끈다**(개발 전용, 불필요한 재시작·리스크).
- 자동 시작·실패 시 재시작(NSSM 기본 동작)·로그 파일 경로를 설정한다.
- 대안: `pip install waitress` 후 waitress로 WSGI가 아닌 ASGI는 안 되므로, ASGI는 uvicorn/hypercorn을 그대로 쓴다. 작업 스케줄러 "시작 시 실행"도 가능하나 NSSM이 재시작·로그 면에서 낫다.

---

## 8. 계정·권한 운영

- 초기 1회: 관리 키로 로그인 → **개인별 계정 생성**, 역할 부여(viewer/…/admin). 이후에는 개인 계정으로만 사용.
- 최소권한: 대부분 사용자는 조회/작성 권한만. `data.delete`(회사 삭제·일괄 삭제), `settings.update`(Slack/GLM 설정), `sync.backfill` 등 위험 권한은 소수에게만.
- 비밀번호는 충분히 길게. 퇴사·인원 변동 시 계정 비활성화 절차를 둔다.
- 관리 키(`RTM_ADMIN_API_KEY`)는 유출 시 즉시 교체(값 변경 후 서비스 재시작).

---

## 9. 업데이트 배포 절차

코드 변경을 서버에 반영하는 표준 순서:

```
cd C:\rtm\obsidianwiki
git pull
cd packages\slack-channel-collector\webapp\frontend
npm ci & npm run build
cd ..\backend
.venv\Scripts\pip install -r requirements.txt   # 의존성 변경 시
nssm restart rtm-db
```

배포 전 백업(6절)을 먼저 수행한다. DB 스키마는 앱 시작 시 additive 마이그레이션이 자동 적용된다.

---

## 10. 점검 체크리스트 (배포 완료 판정)

- [ ] 다른 와이파이 기기의 브라우저에서 `https://rtm-db.local` 접속·로그인 성공(인증서 경고 없음).
- [ ] 휴대폰 LTE(와이파이 끈 상태)에서는 접속 **불가** — 외부 미노출 확인.
- [ ] PC 재부팅 후 서비스 자동 기동, 대시보드 정상.
- [ ] 관리 키가 아닌 개인 계정으로 일상 작업 가능, 권한별 버튼 노출 정상.
- [ ] 슬랙 동기화·AI 일괄추정 실행 시 진행률 표시, 중복 클릭 시 "이미 진행 중" 처리.
- [ ] 백업 스케줄 동작(백업 파일 생성 확인).
- [ ] 방화벽 규칙이 443/와이파이 대역으로 제한됨, 8765 외부 차단.
- [ ] BitLocker 활성, OS 화면잠금 설정.

---

## 부록 A — 왜 이렇게까지 하나 (요약)

"사내 와이파이 전용"의 보안은 세 겹으로 보장된다: ① 공유기에서 외부→내부 경로 차단(포트포워딩 off), ② Windows 방화벽에서 와이파이 대역만 인바운드 허용, ③ 앱 서버는 루프백만 바인딩하고 HTTPS 프록시(Caddy) 뒤에 둔다. 여기에 앱 자체 인증·권한과 디스크 암호화·백업을 더해, 내부자·분실·설정 실수 어느 하나가 뚫려도 곧장 데이터 유출로 이어지지 않게 한다.

## 부록 B — 향후 확장 시 고려

지금은 소규모 LAN이라 SQLite로 충분하다. 접속자·동시성이 커지면 (1) PostgreSQL로 이전, (2) 전용 리눅스 서버/컨테이너로 이전, (3) 사내 VPN 경유 원격 접속을 검토한다. 현재 구조(FastAPI + 정적 프론트)는 그대로 옮길 수 있다.
