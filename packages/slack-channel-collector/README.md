# rtm-slack-channel-collector

`#tf_cross_team_sales` 채널을 주기적으로 수집해 JSON으로 저장하는 작은 Slack 수집 패키지입니다.

기존 `automation/drive_wikify` 수집기는 raw export 이후 필터링, 위키 승격, 프로젝트 공간 생성까지 수행합니다. 이 패키지는 그중 재사용 가능한 최소 경계만 분리했습니다.

## 빠른 시작

```bash
cd packages/slack-channel-collector
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
cp .env.example .env
rtm-slack-collect --env-file .env --dry-run --json
```

패키지 안에는 [collector.env](src/rtm_slack_channel_collector/config/collector.env)가 포함되어 있어 채널, 스케줄, 저장 경로, Slack 호환 키, GLM 호환 키의 기본값이 같이 이동합니다. 실제 실행에 필요한 secret 값(`SLACK_BOT_TOKEN`, 필요 시 `GLM_API_KEY`)만 `.env`나 OS 환경변수로 주입하면 됩니다.

실제 저장:

```bash
rtm-slack-collect --env-file .env --json
```

기본 산출물:

- `data/slack/YYYY-MM-DD/tf_cross_team_sales_C01L5SA4Y4C_...json`
- `data/slack_state.json`

## 매일 24:00 실행

서버나 Mac의 스케줄러에서 매일 00:00에 `rtm-slack-collect --env-file .env --json`을 실행하는 구성이 가장 단순합니다. 사람이 말하는 `24:00`은 다음 날 `00:00`으로 처리됩니다.

패키지 내부 루프를 쓰려면:

```bash
rtm-slack-collect --env-file .env --schedule --schedule-time 24:00 --json
```

macOS `launchd` 예시는 `examples/launchd.kr.plist`를 보세요.

## 포함 범위

- Slack 채널 resolve
- `conversations.history` 기반 채널 메시지 수집
- 선택적 `conversations.replies` 스레드 수집
- 파일 본문 다운로드 없이 Slack 파일 메타데이터 보존
- JSON raw export 저장
- 증분 수집 state 저장
- 매일 지정 시각 실행 루프
- 기존 솔루션의 `SLACK_*`, `SLACK_COLLECT_*`, `GLM_*` 환경 키 기본값 반영

## 제외 범위

- 위키 파일 수정
- GLM/LLM 필터링
- 프로젝트 자동 생성
- 첨부파일 다운로드와 문서 본문 추출
- Slack 메시지 삭제/수정/전송

이 제외 경계 덕분에 다른 제품이나 서버에 가져가도 부작용 없이 `JSON evidence collector`로만 사용할 수 있습니다.

설정이 제대로 따라왔는지 확인:

```bash
rtm-slack-collect --print-config --json
```

출력에는 token/API key 원문을 노출하지 않고 `*_configured` 여부만 표시합니다.
