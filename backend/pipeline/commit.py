"""Writes only confirmed, validated reminder data; never analyzes messages."""
from db import store
from pipeline.schemas import Reminder

def commit(user_id,draft,confirmed=False):
    if confirmed is not True:raise ValueError('confirmation required')
    return store.save(user_id,Reminder.model_validate(draft).model_dump())

def patch(user_id,rid,changes):
    old=store.get(user_id,rid)
    if old is None:raise KeyError(rid)
    data={key:old[key] for key in Reminder.model_fields}
    data.update(changes)
    return store.update(user_id,rid,Reminder.model_validate(data).model_dump())
