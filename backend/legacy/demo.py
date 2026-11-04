"""
AarogyaVaani - interactive command line demo.

Run this and type in Tamil, Hindi or English. Type 'quit' to exit.
This is the same pipeline that would sit behind a Telegram bot or a web
chat window - see src/telegram_bot.py for how it plugs into Telegram.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.chatbot import AarogyaVaaniBot

def main():
    print("=" * 60)
    print("  AarogyaVaani -- Medication Reminder Chatbot (demo)")
    print("  Type in Tamil, Hindi or English. Type 'quit' to exit.")
    print("=" * 60)
    bot = AarogyaVaaniBot()
    chat_id = "cli_demo_user"
    while True:
        try:
            text = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break
        if not text:
            continue
        if text.lower() in ("quit", "exit"):
            print("Bye.")
            break
        reply = bot.process_message(chat_id, text)
        print(f"AarogyaVaani: {reply}")


if __name__ == "__main__":
    main()
