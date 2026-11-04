// Actual production SQL, executed only against a synthetic temporary SQLite file.
jest.mock('expo-sqlite',()=>{
 const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
 const folder=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'av-p14-'));
 const connections=new Set<any>();let opens=0;
 return {closeFixture:()=>{for(const db of connections)db.close();connections.clear();},
 cleanup:()=>{for(const db of connections)db.close();fs.rmSync(folder,{recursive:true});},
 opens:()=>opens,
 openDatabaseAsync:async()=>{
  const value=new DatabaseSync(path.join(folder,'synthetic.db'));connections.add(value);opens++;
  return {execAsync:async(sql:string)=>value.exec(sql),runAsync:async(sql:string,...args:any[])=>value.prepare(sql).run(...args),getFirstAsync:async(sql:string,...args:any[])=>value.prepare(sql).get(...args),getAllAsync:async(sql:string,...args:any[])=>value.prepare(sql).all(...args)};
 }};
});
import { readScheduleState,writeScheduleState } from '../src/services/storage/preferences';
import { readDoses,recordDose,snapshotDoses } from '../src/features/tracking/storage';
import { scheduledDoses } from '../src/features/tracking/doses';
import { NotificationEngine,State,Driver } from '../src/features/notifications/engine';
import { Reminder } from '../src/services/api/models';
const scope='https://p14-persistence.example',now=Date.parse('2026-10-19T02:00:00Z');
const reminder:Reminder={id:91,user_id:'synthetic',medicine:'P14 Temporary',times:['08:00','13:00','21:00'],days_of_week:'daily',status:'active',language:'en',timezone:'Asia/Kolkata',note:null,updated_at:'2026-10-19T00:00:00Z'};
afterAll(()=>require('expo-sqlite').cleanup());

test('full SQLite close/reopen retains IDs, reminder schedules and tracking; repeated restore cannot duplicate or overwrite history',async()=>{
 const transport=jest.spyOn(global,'fetch').mockRejectedValue(new Error('offline fixture'));
 try{
  const native=new Map<string,string>();
  const d:Driver={read:async()=>await readScheduleState() as State,write:writeScheduleState,permission:async()=>true,scheduled:async()=>[...native].map(([identifier,signature])=>({identifier,signature})),schedule:async(p,s)=>{native.set(p.identifier,s);},cancel:async id=>{native.delete(id);},signature:p=>p.medicine,now:()=>now,health:()=>{}};
  const engine=new NotificationEngine(d);await engine.create(scope,async()=>reminder);
  const day=new Date(2026,9,19,12),doses=scheduledDoses([reminder],day);
  await snapshotDoses('synthetic-device',doses);await recordDose('synthetic-device',doses[0],'taken');
  const saved=await readScheduleState(),history=await readDoses('synthetic-device');
  require('expo-sqlite').closeFixture();
  let reopened!:typeof import('../src/services/storage/preferences'),tracking!:typeof import('../src/features/tracking/storage');
  jest.isolateModules(()=>{reopened=require('../src/services/storage/preferences');tracking=require('../src/features/tracking/storage');});
  expect(await reopened.readScheduleState()).toEqual(saved);expect(await tracking.readDoses('synthetic-device')).toEqual(history);
  expect(require('expo-sqlite').opens()).toBe(2);
  const restarted=new NotificationEngine({...d,read:async()=>await reopened.readScheduleState() as State,write:reopened.writeScheduleState});
  await restarted.refreshCached(scope);await restarted.refreshCached(scope);
  await tracking.snapshotDoses('synthetic-device',doses);await tracking.recordDose('synthetic-device',doses[0],'taken');
  expect(native.size).toBe(90);expect(await tracking.readDoses('synthetic-device')).toEqual(history);
  await restarted.create(scope,async()=>({...reminder,id:92,medicine:'P14 Second',times:['09:00']}));
  expect((await reopened.readScheduleState() as State)[scope].reminders.map(r=>r.id)).toEqual([91,92]);
  await restarted.remove(scope,91,async()=>{});
  expect(await tracking.readDoses('synthetic-device')).toEqual(history);expect(native.size).toBe(30);
  expect(transport).not.toHaveBeenCalled();
 }finally{transport.mockRestore();}
});
