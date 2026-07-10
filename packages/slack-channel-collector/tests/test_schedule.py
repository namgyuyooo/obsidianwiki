from datetime import datetime
from zoneinfo import ZoneInfo

from rtm_slack_channel_collector import seconds_until_next_run


def test_midnight_schedule_before_midnight():
    now = datetime(2026, 7, 10, 23, 0, tzinfo=ZoneInfo("Asia/Seoul"))
    assert seconds_until_next_run("00:00", "Asia/Seoul", now) == 3600


def test_24_hour_schedule_aliases_midnight():
    now = datetime(2026, 7, 10, 23, 0, tzinfo=ZoneInfo("Asia/Seoul"))
    assert seconds_until_next_run("24:00", "Asia/Seoul", now) == 3600


if __name__ == "__main__":
    test_midnight_schedule_before_midnight()
    test_24_hour_schedule_aliases_midnight()
