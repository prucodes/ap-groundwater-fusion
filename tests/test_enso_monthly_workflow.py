"""The monthly Pacific refresh must not collide with the weekly one.

Both push to main, and a push fails when main has moved underneath it. That has
already cost this project two silent weeks once.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOWS = os.path.join(ROOT, ".github", "workflows")
MONTHLY = os.path.join(FLOWS, "enso_pacific_monthly.yml")
WEEKLY = os.path.join(FLOWS, "phase3_weekly_levels.yml")


def crons(path):
    return re.findall(r'cron:\s*"([^"]+)"', open(path).read())


def test_the_monthly_refresh_is_scheduled_monthly():
    found = crons(MONTHLY)
    assert found, "no schedule"
    minute, hour, day, month, weekday = found[0].split()
    assert day != "*", "this must run on a day of the month, not every day"
    # NOAA posts the previous month in the first week; before the 5th risks
    # rebuilding with nothing new, and late in the month wastes the freshness.
    assert 5 <= int(day) <= 12


def test_it_does_not_start_inside_the_weekly_refresh_window():
    """The weekly job takes about half an hour and pushes to main at the end."""
    weekly_hour = int(crons(WEEKLY)[0].split()[1])
    monthly_hour = int(crons(MONTHLY)[0].split()[1])
    assert abs(monthly_hour - weekly_hour) >= 2, (
        f"monthly starts at {monthly_hour}:00 against the weekly at {weekly_hour}:00"
    )


def test_it_rebases_rather_than_failing_if_main_moved():
    body = open(MONTHLY).read()
    assert "--rebase" in body
    assert "concurrency" in body


def test_it_refuses_to_publish_a_panel_that_disagrees_with_the_index():
    body = open(MONTHLY).read()
    assert "tests/test_enso_pacific.py" in body
    committed = body[body.index("git add"):]
    assert "app/data/enso_pacific.json" in committed
    assert "app/public/enso" in committed


def test_it_says_nothing_when_the_month_has_not_landed():
    assert "nothing to publish" in open(MONTHLY).read()
