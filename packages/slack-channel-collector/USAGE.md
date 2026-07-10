# Slack Channel Collector Usage

## 1. 설치

```bash
cd packages/slack-channel-collector
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

## 2. 환경변수

패키지에는 `src/rtm_slack_channel_collector/config/collector.env`가 포함되어 있습니다. 이 파일이 채널, 스케줄, 저장 경로, Slack/GLM 호환 키의 기본값을 제공합니다.

운영 환경에서는 secret만 별도 `.env`로 덮어씁니다.

```bash
cp .env.example .env
```

필수값은 Slack token입니다.

```bash
SLACK_BOT_TOKEN=xoxb-your-token
```

GLM API 키가 downstream 정리 모듈에 필요하면 같은 `.env`에 넣습니다. 현재 raw JSON 수집기는 GLM을 호출하지 않지만, 패키지 설정에는 GLM 계열 값이 반영됩니다.

```bash
GLM_API_URL=https://api.example.com/v1
GLM_API_KEY=...
GLM_MODEL=glm-5.1
GLM_SLACK_FILTER_MODEL=...
```

기본 채널은 이미 `tf_cross_team_sales` / `C01L5SA4Y4C`로 잡혀 있습니다.

```bash
SLACK_COLLECT_CHANNEL=tf_cross_team_sales
SLACK_COLLECT_CHANNEL_ID=C01L5SA4Y4C
```

## 3. 1회 수집

설정 확인:

```bash
rtm-slack-collect --env-file .env --print-config --json
```

쓰기 전 미리보기:

```bash
rtm-slack-collect --env-file .env --dry-run --json
```

실제 JSON 저장:

```bash
rtm-slack-collect --env-file .env --json
```

처음 실행은 `SLACK_COLLECT_LOOKBACK_HOURS=24` 기준으로 최근 24시간을 가져옵니다. 이후부터는 `SLACK_COLLECT_STATE_PATH`에 저장된 `latest_message_ts` 기준으로 증분 수집합니다.

## 4. 매일 24:00 수집

운영에서는 OS 스케줄러 사용을 권장합니다.

cron 예시:

```cron
0 0 * * * cd /path/to/packages/slack-channel-collector && /path/to/.venv/bin/rtm-slack-collect --env-file .env --json >> /tmp/rtm-slack-collector.log 2>&1
```

macOS `launchd`는 `examples/launchd.kr.plist`를 복사해 경로와 token을 수정한 뒤 등록합니다.

```bash
launchctl load ~/Library/LaunchAgents/com.rtm.slack-cross-team-sales-collector.plist
```

패키지 자체 루프:

```bash
rtm-slack-collect --env-file .env --schedule --schedule-time 24:00 --json
```

## 5. 출력 JSON 구조

```json
{
  "type": "slack_channel_json_export",
  "workspace": "RTM Slack",
  "collected_at": "2026-07-10T15:00:00+00:00",
  "channel": {
    "id": "C01L5SA4Y4C",
    "name": "tf_cross_team_sales"
  },
  "history_window": {
    "mode": "lookback_hours",
    "lookback_hours": 24,
    "message_order": "newest_first"
  },
  "messages": []
}
```

## 6. 다른 제품에 이식

```bash
cp -R packages/slack-channel-collector /path/to/your-product/packages/
cd /path/to/your-product/packages/slack-channel-collector
pip install -e .
```

이 패키지는 표준 라이브러리만 사용하므로 Slack token과 Python 3.10 이상만 있으면 동작합니다.
