"""FastAPI routes. Message bodies and bearer tokens are never logged."""
from fastapi import FastAPI,Depends,HTTPException,Header
import os
import sqlite3
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pg8000.dbapi import Error as PostgreSQLError
from scramp import ScramException
from db import store
from pipeline.access import device,public_limit
from pipeline.analyze import analyze
from pipeline.commit import commit,patch
from pipeline.packs import installed,load
from pipeline.schemas import DeviceRequest,AnalyzeRequest,ConfirmedReminder,PatchReminder,DoseEvent

app=FastAPI(title='AarogyaVaani',version='0.1.0',telemetry={'tracing':False,'metrics':False,'logs':False,'operation_spans':False,'auto_configure':False})

@app.exception_handler(PostgreSQLError)
@app.exception_handler(ScramException)
@app.exception_handler(OSError)
@app.exception_handler(sqlite3.Error)
async def database_unavailable(request,exc):
    # Handle inside the mounted app before its server-error middleware emits a
    # response or logs driver details, including query parameters or credentials.
    return JSONResponse(status_code=503,content={'status':'unavailable'})

@app.exception_handler(RequestValidationError)
async def invalid_request(request,exc):
    # Pydantic's default error contains the original input. Do not echo chat or tokens.
    return JSONResponse(status_code=422,content={'detail':'Invalid request'})

@app.middleware('http')
async def cutover_write_freeze(request,call_next):
    if os.environ.get('AAROGYAVAANI_CUTOVER_READ_ONLY') == '1':
        # Ordinary authenticated GETs update rate-limit buckets. During freeze,
        # admit only endpoints whose database operations are actually read-only.
        if request.method not in ('GET','HEAD','OPTIONS') or request.url.path not in ('/v1/cutover/identity','/v1/health','/v1/ready'):
            return JSONResponse(status_code=503,content={'status':'unavailable'})
    return await call_next(request)

@app.get('/v1/cutover/identity')
def cutover_identity(authorization:str|None=Header(default=None)):
    from db.cutover import identity
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401,'Bearer token required')
    result=identity(authorization[7:])
    if result is None:raise HTTPException(401,'Invalid device token')
    return JSONResponse(result,headers={'Cache-Control':'no-store'})

@app.get('/v1/health')
def health():return {'status':'ok','version':'0.1.0'}

@app.post('/v1/devices',status_code=201,dependencies=[Depends(public_limit)])
def register(body:DeviceRequest):return store.register(body.timezone)

@app.post('/v1/analyze')
def analysis(body:AnalyzeRequest,user=Depends(device)):
    return analyze(body.text,body.ui_language,store.listing(user['user_id']))

@app.post('/v1/reminders',status_code=201)
def create(body:ConfirmedReminder,user=Depends(device)):
    data=body.model_dump(exclude={'confirmed'})
    if 'timezone' not in body.model_fields_set:data['timezone']=user['timezone']
    return commit(user['user_id'],data,body.confirmed)

@app.get('/v1/reminders')
def reminders(user=Depends(device)):return store.listing(user['user_id'])

@app.patch('/v1/reminders/{rid}')
def edit(rid:int,body:PatchReminder,user=Depends(device)):
    try:return patch(user['user_id'],rid,body.model_dump(exclude_unset=True))
    except KeyError:raise HTTPException(404,'Reminder not found')
    except ValidationError:raise HTTPException(422,'Invalid reminder')

@app.delete('/v1/reminders/{rid}')
def remove(rid:int,user=Depends(device)):
    if not store.get(user['user_id'],rid):raise HTTPException(404,'Reminder not found')
    store.delete(user['user_id'],rid)
    return {'deleted':True}

@app.post('/v1/reminders/{rid}/events',status_code=201)
def record(rid:int,body:DoseEvent,user=Depends(device)):
    if not store.get(user['user_id'],rid):raise HTTPException(404,'Reminder not found')
    return store.event(rid,body.model_dump(mode='json'))

@app.get('/v1/languages')
def languages(user=Depends(device)):
    return [load(code)['meta'] for code in installed()]

@app.get('/v1/help')
def help_text(lang:str='en',user=Depends(device)):
    if lang not in installed():raise HTTPException(422,'Unsupported language')
    return {'text':load(lang)['replies']['help'],'language':lang}

@app.delete('/v1/me')
def delete_me(user=Depends(device)):
    store.delete_user(user['user_id'])
    return {'deleted':True}
