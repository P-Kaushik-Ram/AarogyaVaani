jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../config/backendCutover',()=>({approvedBackendCutover:{id:'synthetic-reviewed-plan',from:'https://old-cutover.example',to:'https://new-cutover.example'}}));
jest.mock('expo-sqlite',()=>{
 const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');const folder=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'av-cutover-'));let counter=0;const connections=new Set<any>();
 return {reset:()=>{for(const db of connections)db.close();connections.clear();counter++;},closeFixture:()=>{for(const db of connections)db.close();connections.clear();},cleanup:()=>{for(const db of connections)db.close();fs.rmSync(folder,{recursive:true});},
 openDatabaseAsync:async()=>{const db=new DatabaseSync(path.join(folder,`synthetic-${counter}.db`));connections.add(db);return {execAsync:async(sql:string)=>db.exec(sql),runAsync:async(sql:string,...args:any[])=>db.prepare(sql).run(...args),getFirstAsync:async(sql:string,...args:any[])=>db.prepare(sql).get(...args),getAllAsync:async(sql:string,...args:any[])=>db.prepare(sql).all(...args)};}};
});
import * as SecureStore from 'expo-secure-store';
import { verifiedBridge,bridgeKey,Manifest,manifest,selectionKey } from '../src/services/api/cutover';
import { NotificationEngine,Driver,State } from '../src/features/notifications/engine';
import { scheduledDoses } from '../src/features/tracking/doses';
import type { Reminder } from '../src/services/api/models';
const from='https://old-cutover.example',to='https://new-cutover.example',id='synthetic-reviewed-plan',token='synthetic-private-token';
const plan={id,from,to};
const proof:Manifest={version:1,user_id:'synthetic-user',timezone:'Asia/Kolkata',digest:'a'.repeat(64),writes_blocked:true,counts:{devices:1,reminders:3,deleted:1,paused:1,events:2,logs:1}};
const reminder:Reminder={id:91,user_id:'synthetic-user',medicine:'Synthetic only',times:['08:00'],days_of_week:'daily',status:'active',language:'en',timezone:'Asia/Kolkata',note:null,updated_at:'2026-10-20T00:00:00Z'};
let stored:string,failStore:'none'|'before'|'after',session:typeof import('../src/services/api/session'),storage:typeof import('../src/services/storage/preferences'),tracking:typeof import('../src/features/tracking/storage');
let fetcher:jest.Mock;const original=global.fetch;
beforeEach(()=>{
 require('expo-sqlite').reset();stored=JSON.stringify({[from]:token,[from+'.tracking']:'opaque-existing-history'});failStore='none';
 (SecureStore.getItemAsync as jest.Mock).mockImplementation(async()=>stored);
 (SecureStore.setItemAsync as jest.Mock).mockImplementation(async(_key:string,value:string)=>{if(failStore==='before')throw new Error('synthetic-write-failure');stored=value;if(failStore==='after')throw new Error('synthetic-lost-ack');});
 fetcher=jest.fn(async(url:string)=>{if(url.endsWith('/v1/cutover/identity'))return {ok:true,status:200,json:async()=>({...proof,counts:{...proof.counts}})};if(url.endsWith('/v1/reminders'))return {ok:true,status:200,json:async()=>[reminder]};throw new Error('Registration must never happen');});global.fetch=fetcher as any;
 jest.isolateModules(()=>{session=require('../src/services/api/session');storage=require('../src/services/storage/preferences');tracking=require('../src/features/tracking/storage');});
});
afterAll(()=>{global.fetch=original;require('expo-sqlite').cleanup();});

test('bridge preserves secure token, real synthetic SQLite history, notification IDs and restart recovery without duplicate alarms',async()=>{
 const now=Date.parse('2026-10-20T00:00:00Z'),native=new Map<string,string>();let scheduled=0,cancelled=0;
 const driver:Driver={read:async()=>await storage.readScheduleState() as State,write:storage.writeScheduleState,permission:async()=>true,scheduled:async()=>[...native].map(([identifier,signature])=>({identifier,signature})),schedule:async(p,s)=>{scheduled++;native.set(p.identifier,s);},cancel:async key=>{cancelled++;native.delete(key);},signature:p=>p.medicine,now:()=>now,health:()=>{}};
 const engine=new NotificationEngine(driver);await engine.create(from,async()=>reminder);await engine.snooze(from,reminder.id,Date.parse('2026-10-19T02:30:00Z'),10);
 const doses=scheduledDoses([reminder],new Date(2026,9,20,12));await tracking.snapshotDoses('opaque-existing-history',doses);await tracking.recordDose('opaque-existing-history',doses[0],'taken');const previous=scheduledDoses([reminder],new Date(2026,9,19,12));await tracking.snapshotDoses('opaque-existing-history',previous);await tracking.recordDose('opaque-existing-history',previous[0],'skipped');
 const state=await storage.readScheduleState(),history=await tracking.readDoses('opaque-existing-history'),ids=[...native.keys()],scheduleCount=scheduled;
 await session.activateBackendCutover(id,true);
 expect(await storage.readScheduleState()).toEqual(state);expect(scheduled).toBe(scheduleCount);expect(cancelled).toBe(0);
 expect(JSON.parse(stored)[from]).toBe(token);expect(JSON.parse(stored)[to]).toBeUndefined();
 expect(await session.notificationScope(to)).toBe(from);expect(await session.trackingScope(to)).toBe('opaque-existing-history');
 expect(await session.getApi(to).list()).toEqual([reminder]);expect(fetcher).toHaveBeenLastCalledWith(to+'/v1/reminders',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer '+token}),redirect:'error'}));
 await engine.refresh(await session.notificationScope(to),()=>session.getApi(to).list());expect([...native.keys()]).toEqual(ids);expect(scheduled).toBe(scheduleCount);expect(cancelled).toBe(0);
 require('expo-sqlite').closeFixture();let restarted!:typeof session,reopened!:typeof storage,historyReader!:typeof tracking;
 jest.isolateModules(()=>{restarted=require('../src/services/api/session');reopened=require('../src/services/storage/preferences');historyReader=require('../src/features/tracking/storage');});
 expect(await reopened.readScheduleState()).toEqual(state);expect(await historyReader.readDoses(await restarted.trackingScope(to))).toEqual(history);
 await restarted.activateBackendCutover(id,true);expect(await restarted.getApi(from).list()).toEqual([reminder]);
 expect(fetcher.mock.calls.every(([url])=>!url.endsWith('/v1/devices'))).toBe(true);
});

test.each(['unapproved','unconfirmed','missing-token','missing-history-scope','pending-save','conflicting-target','corrupt-vault'])('blocks %s without network or credential mutation',async reason=>{
 let values=JSON.parse(stored);if(reason==='missing-token')delete values[from];if(reason==='missing-history-scope')delete values[from+'.tracking'];if(reason==='pending-save')values[from+'.pending']='true';if(reason==='conflicting-target')values[to]='synthetic-other';stored=reason==='corrupt-vault'?'invalid JSON':JSON.stringify(values);const before=stored;
 await expect(session.activateBackendCutover(reason==='unapproved'?'another-plan':id,reason!=='unconfirmed')).rejects.toBeDefined();expect(stored).toBe(before);expect(fetcher).not.toHaveBeenCalled();
});

test.each(['owner','digest','history','deleted','unfrozen','auth','redirect','malformed'])('rejects %s manifest mismatch and retains all old state',async reason=>{
 const before=stored;fetcher.mockImplementation(async(url:string)=>{const value={...proof,counts:{...proof.counts}};if(url.startsWith(to)){
 if(reason==='owner')value.user_id='different-synthetic';if(reason==='digest')value.digest='b'.repeat(64);if(reason==='history')value.counts.events++;if(reason==='deleted')value.counts.deleted=0;if(reason==='unfrozen')value.writes_blocked=false;if(reason==='malformed')value.digest='bad';}
 return {ok:!['auth','redirect'].includes(reason),status:reason==='redirect'?302:401,json:async()=>value};});
 await expect(session.activateBackendCutover(id,true)).rejects.toMatchObject({kind:'cutover'});expect(stored).toBe(before);
 for(const [url,options] of fetcher.mock.calls){expect([from,to]).toContain(new URL(url).origin);expect(options.redirect).toBe('error');expect(options.cache).toBe('no-store');}
});

test.each(['before','after'] as const)('storage failure %s write is recoverable and never re-registers',async mode=>{
 const before=stored;failStore=mode;await expect(session.activateBackendCutover(id,true)).rejects.toMatchObject({kind:'storage'});if(mode==='before')expect(stored).toBe(before);failStore='none';await session.activateBackendCutover(id,true);expect(await session.getApi(from).list()).toEqual([reminder]);expect(JSON.parse(stored)[from]).toBe(token);
});

test('rollback requires fresh equal frozen manifests and preserves aliases, history and token',async()=>{
 await session.activateBackendCutover(id,true);await session.activateBackendCutover(id,true,'source');expect(await session.notificationScope(to)).toBe(from);expect(await session.trackingScope(to)).toBe('opaque-existing-history');await session.getApi(to).list();expect(fetcher.mock.calls.at(-1)![0]).toBe(from+'/v1/reminders');
 fetcher.mockImplementation(async()=>({ok:true,json:async()=>({...proof,writes_blocked:false})}));await expect(session.activateBackendCutover(id,true)).rejects.toMatchObject({kind:'cutover'});expect(JSON.parse(JSON.parse(stored)[bridgeKey]).direction).toBe('source');
});

test('ordinary address changes fail closed and never copy or delete a token',async()=>{
 const before=stored;await expect(session.assertAddressAllowed(to)).rejects.toMatchObject({kind:'cutover'});await expect(session.getApi(to).list()).rejects.toMatchObject({kind:'cutover'});expect(fetcher).not.toHaveBeenCalled();expect(stored).toBe(before);
});

test('cutover waits for existing requests and rejects new requests until its single durable commit',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});fetcher.mockImplementationOnce(async()=>{await gate;return {ok:true,json:async()=>[reminder]};});
 const read=session.getApi(from).list();await Promise.resolve();const move=session.activateBackendCutover(id,true);await expect(session.getApi(to).list()).rejects.toMatchObject({kind:'busy'});release();await read;await move;expect(await session.notificationScope(to)).toBe(from);
});

test('vault changes during verification cannot be overwritten by a stale bridge snapshot',async()=>{
 fetcher.mockImplementationOnce(async()=>{stored=JSON.stringify({...JSON.parse(stored),[from+'.pending']:'true'});return {ok:true,json:async()=>proof};});await expect(session.activateBackendCutover(id,true)).rejects.toMatchObject({kind:'busy'});expect(JSON.parse(stored)[bridgeKey]).toBeUndefined();expect(JSON.parse(stored)[from+'.pending']).toBe('true');
});

test('no configured production plan means no credential transfer',async()=>{
 await expect(verifiedBridge(JSON.parse(stored),null,id,true,'target',fetcher as any)).rejects.toMatchObject({kind:'cutover'});expect(fetcher).not.toHaveBeenCalled();
});


test('verification has a hard deadline even when a transport ignores abort',async()=>{
 jest.useFakeTimers();try{
  const request=manifest(from,token,(()=>new Promise(()=>{})) as any);
  const rejected=expect(request).rejects.toMatchObject({kind:'cutover'});
  await jest.advanceTimersByTimeAsync(10000);await rejected;expect(jest.getTimerCount()).toBe(0);
 }finally{jest.useRealTimers();}
});

test('old and new URL aliases share a mutation lock and never create duplicate confirmed reminders',async()=>{
 await session.activateBackendCutover(id,true);
 fetcher.mockImplementation(async(_url:string,options:any)=>({ok:true,json:async()=>options.method==='POST'?reminder:[reminder]}));
 const analysis={detected_language:'en',intent:'add_reminder',confidence:1,safety:{triggered:false,reason:null},draft:{medicine:'Synthetic only',times:['08:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'synthetic',language:'en'}} as any;
 const results=await Promise.allSettled([session.getApi(from).create(analysis,true),session.getApi(to).create(analysis,true)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect(fetcher.mock.calls.filter(([url,options])=>url.endsWith('/v1/reminders')&&options.method==='POST')).toHaveLength(1);
 expect(JSON.parse(stored)[from+'.pending']).toBeUndefined();expect(JSON.parse(stored)[from]).toBe(token);
});

test('corrupt durable bridge fails closed rather than registering an identity',async()=>{
 stored=JSON.stringify({...JSON.parse(stored),[bridgeKey]:'invalid'});await expect(session.getApi(from).list()).rejects.toMatchObject({kind:'storage'});expect(fetcher).not.toHaveBeenCalled();
});


test('ordinary URL changes cannot silently select a different preexisting device identity',async()=>{
 stored=JSON.stringify({...JSON.parse(stored),[to]:'another-synthetic-token',[selectionKey]:from});const before=stored;
 await expect(session.getApi(to).list()).rejects.toMatchObject({kind:'cutover'});
 await expect(session.assertAddressAllowed(to)).rejects.toMatchObject({kind:'cutover'});
 expect(fetcher).not.toHaveBeenCalled();expect(stored).toBe(before);
});
