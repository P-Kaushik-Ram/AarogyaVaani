"""
Consolidated test suite for AarogyaVaani.

Tests cover:
- Medicine entity extraction (including expanded 100+ medicine list)
- Time parsing with minutes
- Reminder scheduling logic
- Safety keyword override
- Help functionality
"""

import pytest
import sys
from pathlib import Path
from datetime import datetime
import tempfile
import os

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.entity_extract import extract_entities
from src import scheduler, db
from src.chatbot import AarogyaVaaniBot


class TestMedicineExtraction:
    """Test that medicine names are correctly extracted from text."""
    
    def test_common_medicines_english(self):
        """Test extraction of common English medicine names."""
        tests = [
            ("remind me to take paracetamol", "paracetamol"),
            ("set phexin reminder", "phexin"),
            ("vitamin d in the morning", "vitamin d"),
            ("take calcium at night", "calcium"),
            ("omeprazole after lunch", "omeprazole"),
        ]
        
        for text, expected in tests:
            result = extract_entities(text, "en")
            assert result["medicine"] == expected, f"Failed for: {text}"
    
    def test_tamil_medicines(self):
        """Test Tamil medicine extraction."""
        tests = [
            ("பாராசிட்டமால் நினைவூட்டு", "பாராசிட்டமால்"),
            ("மெட்ஃபார்மின் மாத்திரை", "மெட்ஃபார்மின்"),
        ]
        
        for text, expected in tests:
            result = extract_entities(text, "ta")
            assert result["medicine"] == expected


class TestTimeExtraction:
    """Test clock time extraction with minutes."""
    
    def test_time_with_minutes(self):
        """Test that times with minutes are parsed correctly."""
        tests = [
            ("take aspirin at 12:24 am", "12:24 am"),
            ("vitamin d at 8:30 am", "8:30 am"),
            ("paracetamol at 3:45 pm", "3:45 pm"),
        ]
        
        for text, expected_time in tests:
            result = extract_entities(text, "en")
            assert result["clock_time"] == expected_time, f"Failed for: {text}"
    
    def test_time_without_minutes(self):
        """Test times without explicit minutes get :00 added."""
        result = extract_entities("metformin at 9 pm", "en")
        assert result["clock_time"] == "9:00 pm"
    
    def test_normalize_time(self):
        """Test conversion of time strings to (hour, minute) tuples."""
        assert scheduler.normalize_time("12:34 am") == (0, 34)  # Midnight
        assert scheduler.normalize_time("8:30 am") == (8, 30)
        assert scheduler.normalize_time("3:45 pm") == (15, 45)
        assert scheduler.normalize_time("12:00 pm") == (12, 0)  # Noon
        assert scheduler.normalize_time("9 pm") == (21, 0)


class TestScheduler:
    """Test reminder scheduling and due-checking logic."""
    
    def setup_method(self):
        """Create temporary database for each test."""
        self.original_db = db.DB_PATH
        self.temp_db = tempfile.mktemp(suffix=".db")
        db.DB_PATH = self.temp_db
        db.init_db()
    
    def teardown_method(self):
        """Clean up temporary database."""
        if os.path.exists(self.temp_db):
            os.unlink(self.temp_db)
        db.DB_PATH = self.original_db
    
    def test_exact_minute_matching(self):
        """Test that reminders only trigger at the exact minute."""
        user_id = db.get_or_create_user("test", "Test", "en")
        db.add_reminder(user_id, "calcium", None, "12:34 am", "once_daily", "en")
        
        # Should not match before or after the exact time
        assert len(scheduler.due_reminders_at(user_id, datetime(2024, 1, 1, 0, 33))) == 0
        assert len(scheduler.due_reminders_at(user_id, datetime(2024, 1, 1, 0, 34))) == 1
        assert len(scheduler.due_reminders_at(user_id, datetime(2024, 1, 1, 0, 35))) == 0
    
    def test_time_of_day_reminders(self):
        """Test reminders with only time_of_day (no specific clock time)."""
        user_id = db.get_or_create_user("test", "Test", "en")
        db.add_reminder(user_id, "aspirin", "morning", None, "once_daily", "en")
        
        # Should trigger at 8:00 (morning default)
        assert len(scheduler.due_reminders_at(user_id, datetime(2024, 1, 1, 8, 0))) == 1
        assert len(scheduler.due_reminders_at(user_id, datetime(2024, 1, 1, 8, 1))) == 0


class TestSafetyOverride:
    """Test that safety-critical questions are always rejected."""
    
    def setup_method(self):
        """Initialize bot for each test."""
        self.bot = AarogyaVaaniBot()
    
    def test_safety_keywords_english(self):
        """Test English safety keywords trigger rejection."""
        tests = [
            "is metformin safe for me",
            "can I stop taking paracetamol",
            "what are the side effects of aspirin",
            "should I increase my dosage",
            "is it safe to double my dose",
        ]
        
        for text in tests:
            response = self.bot.process_message("test", text)
            assert "medical advice" in response.lower(), f"Failed to reject: {text}"
    
    def test_safety_keywords_tamil(self):
        """Test Tamil safety keywords trigger rejection."""
        tests = [
            "மெட்ஃபார்மின் எனக்கு பாதுகாப்பானதா",
            "ஆஸ்பிரின் பக்கவிளைவுகள் என்ன",
        ]
        
        for text in tests:
            response = self.bot.process_message("test", text)
            assert "மருத்துவ ஆலோசனை" in response, f"Failed to reject: {text}"
    
    def test_safety_keywords_hindi(self):
        """Test Hindi safety keywords trigger rejection."""
        tests = [
            "क्या मेटफॉर्मिन सुरक्षित है",
            "एस्पिरिन के साइड इफेक्ट क्या हैं",
        ]
        
        for text in tests:
            response = self.bot.process_message("test", text)
            assert "चिकित्सा सलाह" in response, f"Failed to reject: {text}"


class TestHelpFunctionality:
    """Test that help requests return appropriate guidance."""
    
    def setup_method(self):
        """Initialize bot for each test."""
        self.bot = AarogyaVaaniBot()
    
    def test_help_english(self):
        """Test English help request."""
        response = self.bot.process_message("test", "help")
        assert "add a reminder" in response.lower()
        assert "view reminders" in response.lower()
    
    def test_help_tamil(self):
        """Test Tamil help request."""
        response = self.bot.process_message("test", "உதவி")
        assert "நினைவூட்டல்" in response
    
    def test_help_hindi(self):
        """Test Hindi help request."""
        response = self.bot.process_message("test", "मदद")
        assert "रिमाइंडर" in response


class TestEndToEnd:
    """End-to-end workflow tests."""
    
    def setup_method(self):
        """Set up bot and clean database."""
        self.original_db = db.DB_PATH
        self.temp_db = tempfile.mktemp(suffix=".db")
        db.DB_PATH = self.temp_db
        self.bot = AarogyaVaaniBot()
    
    def teardown_method(self):
        """Clean up."""
        if os.path.exists(self.temp_db):
            os.unlink(self.temp_db)
        db.DB_PATH = self.original_db
    
    def test_complete_workflow_english(self):
        """Test add, view, cancel workflow in English."""
        chat_id = "test_user"
        
        # Add reminder
        response = self.bot.process_message(chat_id, "remind me to take calcium at 9:00 am")
        assert "Saved" in response
        
        # View reminders
        response = self.bot.process_message(chat_id, "show my reminders")
        assert "calcium" in response
        assert "9:00 am" in response
        
        # Cancel reminder
        response = self.bot.process_message(chat_id, "cancel calcium")
        assert "cancelled" in response.lower()
        
        # Verify it's gone
        response = self.bot.process_message(chat_id, "show my reminders")
        assert "no active reminders" in response.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
