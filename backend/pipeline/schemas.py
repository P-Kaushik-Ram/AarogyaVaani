from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from pydantic import BaseModel,Field,ConfigDict,field_validator

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid')

def validate_timezone(value):
    try:ZoneInfo(value)
    except (ZoneInfoNotFoundError,ValueError):raise ValueError('invalid timezone')
    return value

class DeviceRequest(StrictModel):
    timezone:str='Asia/Kolkata'
    _timezone=field_validator('timezone')(validate_timezone)

class AnalyzeRequest(StrictModel):
    text:str=Field(min_length=1,max_length=300)
    ui_language:Literal['en','hi','ta','ml','kn','te']='en'
    input_mode:Literal['text','voice']='text'

    @field_validator('text')
    @classmethod
    def not_blank(cls,value):
        if not value.strip():raise ValueError('empty text')
        return value

class Reminder(StrictModel):
    medicine:str=Field(min_length=1,max_length=100)
    times:list[str]=Field(min_length=1,max_length=24)
    days_of_week:Literal['daily']|list[int]='daily'
    note:str|None=Field(default=None,max_length=300)
    status:Literal['active','paused']='active'
    language:Literal['en','hi','ta','ml','kn','te']='en'
    timezone:str='Asia/Kolkata'
    _timezone=field_validator('timezone')(validate_timezone)

    @field_validator('medicine')
    @classmethod
    def nonblank(cls,value):
        if not value.strip():raise ValueError('empty medicine')
        return value.strip()

    @field_validator('times')
    @classmethod
    def valid_times(cls,value):
        import re
        if any(not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t) for t in value) or len(set(value))!=len(value):
            raise ValueError('times must be unique HH:mm')
        return sorted(value)

    @field_validator('days_of_week')
    @classmethod
    def valid_days(cls,value):
        if value!='daily' and (not value or any(type(d)!=int or not 1<=d<=7 for d in value) or len(set(value))!=len(value)):
            raise ValueError('days must be unique integers 1 to 7')
        return value

class ConfirmedReminder(Reminder):
    confirmed:Literal[True]

class PatchReminder(StrictModel):
    medicine:str|None=None
    times:list[str]|None=None
    days_of_week:Literal['daily']|list[int]|None=None
    note:str|None=Field(default=None,max_length=300)
    status:Literal['active','paused']|None=None
    language:Literal['en','hi','ta','ml','kn','te']|None=None
    timezone:str|None=None

class DoseEvent(StrictModel):
    type:Literal['taken','snoozed','skipped']
    scheduled_for:datetime

    @field_validator('scheduled_for')
    @classmethod
    def aware(cls,value):
        if value.tzinfo is None:raise ValueError('timezone required')
        from datetime import timezone
        return value.astimezone(timezone.utc)
