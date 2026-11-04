import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
"""
Telegram front end for AarogyaVaani.

This plugs the same chatbot.AarogyaVaaniBot used by demo.py into Telegram,
so it is not a separate implementation - it just forwards incoming
messages to process_message() and sends back whatever string comes out.

To actually run this:
  1. pip install python-telegram-bot
  2. Message @BotFather on Telegram, create a bot, copy the token it gives you
  3. set AAROGYAVAANI_BOT_TOKEN=<token>
  4. python -m src.telegram_bot
"""

import os
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, ContextTypes, filters

from src.chatbot import AarogyaVaaniBot

bot = AarogyaVaaniBot()


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    text = update.message.text
    reply = bot.process_message(chat_id, text)
    await update.message.reply_text(reply)


def main():
    token = os.environ.get("AAROGYAVAANI_BOT_TOKEN")
    if not token:
        raise SystemExit("Set AAROGYAVAANI_BOT_TOKEN before running this.")

    print("=" * 60)
    print("AarogyaVaani Telegram bot starting...")
    print("Connecting to Telegram...")

    app = ApplicationBuilder().token(token).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✓ Bot connected successfully!")
    print("Open Telegram and search for: @aarogyavaani_reminder_bot")
    print("Send a message to start chatting!")
    print("Press Ctrl+C to stop the bot.")
    print("=" * 60)

    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
