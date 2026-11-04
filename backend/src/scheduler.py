"""
Scheduler for AarogyaVaani.

For the prototype we check active reminders against a given time and
return the ones that match - this is the core logic a real background job
(e.g. APScheduler running every minute) would call repeatedly. We are
demoing the matching logic directly, since actually waiting in real time
for a demo is not practical - the underlying check is identical either way.
"""

from datetime import datetime
import json
from zoneinfo import ZoneInfo
from src import db


def normalize_time(clock_time: str) -> tuple[int, int] | None:
    """Turns '8:00 am', '9:30 pm', '12:24 am' into (hour, minute) tuple in 24-hour format."""
    if not clock_time:
        return None
    clock_time = clock_time.strip().lower()

    hour = None
    minute = 0

    # Handle formats like "2:00 pm", "8:30 am", "12:24 am"
    if ":" in clock_time:
        parts = clock_time.split(":")
        hour_part = parts[0].strip()
        minute_part = parts[1].split()[0].strip()  # Get just the digits before am/pm

        hour = int(hour_part)
        minute = int(minute_part) if minute_part.isdigit() else 0

        if "am" in clock_time:
            if hour == 12:
                hour = 0  # 12 AM is midnight (00:00)
        elif "pm" in clock_time:
            if hour != 12:
                hour += 12  # Convert PM to 24-hour (but 12 PM stays 12)

        return (hour, minute)

    # Handle formats like "8 am" or "9 pm" without colon
    for suffix in ("am", "pm"):
        if suffix in clock_time:
            hour = int(clock_time.replace(suffix, "").strip())
            if suffix == "pm" and hour != 12:
                hour += 12
            elif suffix == "am" and hour == 12:
                hour = 0
            return (hour, 0)

    return None


TIME_OF_DAY_HOUR = {"morning": 8, "afternoon": 13, "evening": 18, "night": 21}


def due_reminders_at(user_id: int, check_time: datetime) -> list:
    if check_time.tzinfo is not None:
        check_time=check_time.astimezone(ZoneInfo(db.user_timezone(user_id)))
    reminders = db.get_active_reminders(user_id)
    due = []
    for r in reminders:
        if r.get('times'):
            days=json.loads(r.get('days_of_week') or '"daily"')
            if days!='daily' and check_time.isoweekday() not in days:continue
            if check_time.strftime('%H:%M') in json.loads(r['times']):due.append(r)
            continue
        target_time = normalize_time(r["clock_time"])

        if target_time:
            # Has specific clock time - check exact hour and minute
            target_hour, target_minute = target_time
            if target_hour == check_time.hour and target_minute == check_time.minute:
                due.append(r)
        else:
            # Only has time_of_day - trigger at the start of that hour (minute 0)
            target_hour = TIME_OF_DAY_HOUR.get(r["time_of_day"])
            if target_hour and target_hour == check_time.hour and check_time.minute == 0:
                due.append(r)

    return due


def format_reminder_message(reminder: dict, language: str) -> str:
    from pipeline.packs import load
    return load(language)['replies']['notification'].format(medicine=reminder['medicine'])


if __name__ == "__main__":
    db_path_test = db.DB_PATH
    if db_path_test.exists():
        db_path_test.unlink()
    db.init_db()
    uid = db.get_or_create_user("sched_test", "Sched Test", "ta")
    db.add_reminder(uid, "மெட்ஃபார்மின்", "morning", "8:00", "once_daily", "ta")
    db.add_reminder(uid, "insulin", None, "9 pm", "once_daily", "en")

    for hour in (8, 9, 14):
        check = datetime.now().replace(hour=hour, minute=0)
        due = due_reminders_at(uid, check)
        print(f"At {hour}:00 ->", [format_reminder_message(r, r["language"]) for r in due])
