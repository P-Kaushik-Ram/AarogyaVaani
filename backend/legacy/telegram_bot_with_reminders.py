import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
"""
Telegram bot for AarogyaVaani with PUSH NOTIFICATIONS.

This version includes:
1. Message handling (same as before)
2. Automatic push notifications at scheduled reminder times
3. Background job that checks every minute for due reminders
4. Standard TLS verification enabled

To run:
  1. set AAROGYAVAANI_BOT_TOKEN=<your_token>
  2. python -m src.telegram_bot_with_reminders
"""

import os
from datetime import datetime, timezone
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    MessageHandler,
    ContextTypes,
    filters,
)

from src.chatbot import AarogyaVaaniBot
from src import db, scheduler

bot = AarogyaVaaniBot()


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming messages from users"""
    chat_id = str(update.effective_chat.id)
    text = update.message.text
    reply = bot.process_message(chat_id, text)
    await update.message.reply_text(reply)


async def check_and_send_reminders(context: ContextTypes.DEFAULT_TYPE):
    """
    Background job that runs every minute to check for due reminders
    and send push notifications to users
    """
    current_time = datetime.now(timezone.utc)
    current_hour = current_time.hour
    current_minute = current_time.minute
    current_date = current_time.date().isoformat()

    print(f"[{current_time.strftime('%Y-%m-%d %H:%M')}] Checking for due reminders...")

    # Get all users from database
    conn = db.get_connection()
    users = conn.execute("SELECT id, chat_id, preferred_language FROM users").fetchall()

    sent_count = 0
    for user in users:
        user_id = user["id"]
        chat_id = user["chat_id"]
        language = user["preferred_language"]

        # Check if this user has any reminders due at this hour
        due_reminders = scheduler.due_reminders_at(user_id, current_time)

        for reminder in due_reminders:
            reminder_id = reminder["id"]

            # Check if we already sent this reminder today
            sent_today = conn.execute(
                """SELECT id FROM reminder_log
                   WHERE reminder_id = ? AND sent_date = ? AND sent_hour = ?""",
                (reminder_id, current_date, current_hour)
            ).fetchone()

            if sent_today:
                # Already sent this reminder this hour today, skip it
                continue

            try:
                # Format the reminder message in user's language
                message = scheduler.format_reminder_message(reminder, language)

                # Send push notification to user
                await context.bot.send_message(chat_id=chat_id, text=f"🔔 {message}")

                # Log that we sent this reminder
                conn.execute(
                    """INSERT INTO reminder_log (reminder_id, sent_date, sent_hour, sent_at)
                       VALUES (?, ?, ?, ?)""",
                    (reminder_id, current_date, current_hour, current_time.isoformat())
                )
                conn.commit()

                sent_count += 1
                print("Reminder delivered")

            except Exception as e:
                print("Reminder delivery failed")

    conn.close()

    if sent_count > 0:
        print(f"  📤 Total reminders sent: {sent_count}")


def main():
    token = os.environ.get("AAROGYAVAANI_BOT_TOKEN")
    if not token:
        raise SystemExit("Set AAROGYAVAANI_BOT_TOKEN before running this.")

    # Initialize database if not exists
    db.init_db()

    print("=" * 70)
    print("AarogyaVaani Telegram Bot with PUSH NOTIFICATIONS")
    print("=" * 70)
    print("Connecting to Telegram...")

    app = ApplicationBuilder().token(token).build()
    if app.job_queue is None:
        raise SystemExit('Install python-telegram-bot[job-queue] to run the optional legacy push sender.')

    # Add message handler for user interactions
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Add job to check for reminders every minute
    job_queue = app.job_queue
    job_queue.run_repeating(
        check_and_send_reminders,
        interval=60,  # Check every 60 seconds (1 minute)
        first=10,     # Start after 10 seconds
    )

    print("✓ Bot connected successfully!")
    print("✓ Reminder scheduler started (checks every minute)")
    print()
    print("Bot Features:")
    print("  • Responds to user messages in English, Hindi, Tamil")
    print("  • Automatically sends push notifications at scheduled times")
    print("  • Supports 100+ common medicines")
    print()
    print("Find your bot: @aarogyavaani_reminder_bot")
    print("Press Ctrl+C to stop")
    print("=" * 70)

    # Start the bot
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
