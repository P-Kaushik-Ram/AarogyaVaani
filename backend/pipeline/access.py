from fastapi import Header,HTTPException,Request
from db import store

def device(authorization:str|None=Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):raise HTTPException(401,'Bearer token required')
    user=store.authenticate(authorization[7:])
    if not user:raise HTTPException(401,'Invalid device token')
    if not store.allow('user:'+user['user_id']):raise HTTPException(429,'Rate limit exceeded')
    return user

def public_limit(request:Request):
    if not store.allow('registration:'+request.client.host,10):raise HTTPException(429,'Rate limit exceeded')
