import { Driver, Health, NotificationEngine, State } from '../src/features/notifications/engine';
import { localReminder, occurrences } from '../src/features/notifications/planner';
import { Reminder } from '../src/services/api/models';
import { ApiError } from '../src/services/api/client';

const scope='https://fixture.example';
const now=Date.parse('2026-10-17T03:00:00Z');
const reminder:Reminder={id:1,user_id:'fixture',medicine:'Calcium',times:['10:00'],days_of_week:'daily',timezone:'Asia/Kolkata',note:null,status:'active',language:'en',updated_at:'2026-10-17T00:00:00Z'};
function fixture(){
 let state:State={},health:Health|undefined;
 const native=new Map<string,string>();
 const d:Driver={read:jest.fn(async()=>JSON.parse(JSON.stringify(state))),write:jest.fn(async v=>{state=JSON.parse(JSON.stringify(v));}),permission:jest.fn(async()=>true),scheduled:jest.fn(async()=>[...native].map(([identifier,signature])=>({identifier,signature}))),schedule:jest.fn(async(p,signature)=>{native.set(p.identifier,signature);}),cancel:jest.fn(async id=>{native.delete(id);}),signature:p=>JSON.stringify([p.medicine,p.time,p.timezone]),now:()=>now,health:jest.fn(v=>{health=v;})};
 return {d,native,engine:new NotificationEngine(d),state:()=>state,health:()=>health};
}
test('confirmed server save schedules once and duplicate authoritative saves replace by ID',async()=>{
 const f=fixture(),save=jest.fn(async()=>reminder);await f.engine.create(scope,save);const count=f.native.size;expect(count).toBe(30);
 await f.engine.create(scope,save);expect(f.native.size).toBe(count);expect(f.d.schedule).toHaveBeenCalledTimes(count);expect(f.state()[scope].reminders).toHaveLength(1);
 expect(f.state()[scope].ids).toEqual([...f.native.keys()]);expect(f.health()?.status).toBe('scheduled');
});
test('failed server save never schedules or persists a draft',async()=>{const f=fixture();await expect(f.engine.create(scope,async()=>{throw new ApiError('timeout');})).rejects.toThrow('timeout');expect(f.native.size).toBe(0);expect(f.d.write).not.toHaveBeenCalled();});
test.each([null,[],undefined,'2026-10-22'] as unknown[])('missing/unsupported recurrence %p schedules nothing',async days=>{
 const f=fixture();await f.engine.create(scope,async()=>({...reminder,days_of_week:days} as Reminder));expect(f.native.size).toBe(0);expect(f.health()?.status).toBe('error');
});
test('one-off date field is rejected rather than silently becoming daily',async()=>{const f=fixture();await f.engine.create(scope,async()=>({...reminder,date:'2026-10-22'}));expect(f.native.size).toBe(0);expect(f.health()?.status).toBe('error');});
test('daily occurrences use saved timezone with zero seconds',()=>{
 const p=occurrences(scope,[localReminder(reminder)],now);expect(p).toHaveLength(30);expect(new Date(p[0].at).toISOString()).toBe('2026-10-17T04:30:00.000Z');
 expect(p.every(v=>v.at%60000===0)).toBe(true);
});
test('named ISO weekdays Monday and Sunday map to correct local dates',()=>{
 const p=occurrences(scope,[localReminder({...reminder,days_of_week:[1,7]})],now);
 expect(p).toHaveLength(9);expect(new Date(p[0].at).toISOString()).toBe('2026-10-18T04:30:00.000Z');expect(new Date(p[1].at).toISOString()).toBe('2026-10-19T04:30:00.000Z');
});
test('successful cancellation removes native identifiers and local metadata',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);await f.engine.remove(scope,1,async()=>({deleted:true}));expect(f.native.size).toBe(0);expect(f.state()[scope].reminders).toEqual([]);expect(f.state()[scope].ids).toEqual([]);});
test('failed cancellation preserves native schedule and metadata',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);const before=f.state();await expect(f.engine.remove(scope,1,async()=>{throw new ApiError('network');})).rejects.toThrow('network');expect(f.native.size).toBe(30);expect(f.state()).toEqual(before);expect(f.d.cancel).not.toHaveBeenCalled();});
test('permission denied never reports alerts active; grant can repair cached confirmed reminders',async()=>{
 const f=fixture();(f.d.permission as jest.Mock).mockResolvedValue(false);await f.engine.create(scope,async()=>reminder);expect(f.native.size).toBe(0);expect(f.health()?.status).toBe('denied');
 (f.d.permission as jest.Mock).mockResolvedValue(true);await f.engine.refresh(scope,undefined,true);expect(f.d.permission).toHaveBeenLastCalledWith(true);expect(f.native.size).toBe(30);
});
test('permission revoked removes pending alarms and retains confirmed details for recovery',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);(f.d.permission as jest.Mock).mockResolvedValue(false);await f.engine.refresh(scope);expect(f.native.size).toBe(0);expect(f.state()[scope].reminders).toHaveLength(1);expect(f.health()?.status).toBe('denied');});
test('restarting and repeated reconciliation do not duplicate notifications',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);const restart=new NotificationEngine(f.d);await restart.refresh(scope,async()=>[reminder]);await restart.refresh(scope,async()=>[reminder]);expect(f.d.schedule).toHaveBeenCalledTimes(30);expect(f.native.size).toBe(30);});
test.each(['network','timeout','auth'] as const)('reconciliation %s preserves offline schedules and does not claim an empty server',async kind=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);await expect(f.engine.refresh(scope,async()=>{throw new ApiError(kind);})).rejects.toThrow(kind);expect(f.native.size).toBe(30);expect(f.state()[scope].reminders).toHaveLength(1);expect(f.health()?.offline).toBe(true);
});
test('local offline refresh refills beyond old window without a backend request',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);f.d.now=()=>now+29*86400000;await f.engine.refresh(scope);expect(f.native.size).toBe(30);expect(f.health()?.until).toBe(now+59*86400000);expect(f.state()[scope].reminders).toHaveLength(1);});
test('successful authoritative empty list cleans up prior alarms',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);await f.engine.refresh(scope,async()=>[]);expect(f.native.size).toBe(0);});
test('paused reminder cancels previous schedule',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);await f.engine.refresh(scope,async()=>[{...reminder,status:'paused'}]);expect(f.native.size).toBe(0);});
test('edited authoritative time replaces alarms without duplicates',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);const old=[...f.native.keys()];await f.engine.refresh(scope,async()=>[{...reminder,times:['11:00']}]);expect(f.native.size).toBe(30);expect([...f.native.keys()].some(k=>old.includes(k))).toBe(false);});
test('origin isolation prevents collisions and cross-origin cleanup',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);await f.engine.create('https://other.example',async()=>reminder);expect(f.native.size).toBe(60);await f.engine.remove(scope,null,async()=>{});expect(f.native.size).toBe(30);});
test('interrupted native setup is reported as error and repaired using deterministic identifiers',async()=>{const f=fixture();(f.d.schedule as jest.Mock).mockRejectedValueOnce(new Error('native'));const saved=await f.engine.create(scope,async()=>reminder);expect(saved).toEqual(reminder);expect(f.health()?.status).toBe('error');await f.engine.refresh(scope);expect(f.native.size).toBe(30);});
test('restart cleans native orphan after a persisted cancellation',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);(f.d.cancel as jest.Mock).mockRejectedValueOnce(new Error('native'));await f.engine.remove(scope,1,async()=>{});expect(f.health()?.status).toBe('error');await new NotificationEngine(f.d).refresh(scope);expect(f.native.size).toBe(0);});
test('foreground force repair recreates exact alarms after Android special-access changes',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);await f.engine.refresh(scope,undefined,false,true);expect(f.d.schedule).toHaveBeenCalledTimes(60);expect(f.native.size).toBe(30);});
test('concurrent list and cancellation serialize so stale list cannot resurrect cancellation',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);let resolve!:(r:Reminder[])=>void;const pending=new Promise<Reminder[]>(r=>{resolve=r;});
 const refresh=f.engine.refresh(scope,()=>pending),cancel=f.engine.remove(scope,1,async()=>{});resolve([reminder]);await Promise.all([refresh,cancel]);expect(f.native.size).toBe(0);
});
test('device timezone changes do not alter saved-zone absolute occurrences',()=>{
 const before=occurrences(scope,[localReminder(reminder)],now);const original=process.env.TZ;
 try{process.env.TZ='America/Los_Angeles';expect(occurrences(scope,[localReminder(reminder)],now)).toEqual(before);}finally{process.env.TZ=original;}
});
test('DST forward nonexistent 02:30 minute is skipped',()=>{
 const p=occurrences(scope,[localReminder({...reminder,timezone:'America/New_York',times:['02:30']})],Date.parse('2026-03-07T00:00Z'));
 expect(p.some(x=>new Date(x.at).toISOString().startsWith('2026-03-08'))).toBe(false);
 expect(p.some(x=>new Date(x.at).toISOString()==='2026-03-09T06:30:00.000Z')).toBe(true);
});
test('DST backward repeated minute rings once at first occurrence',()=>{
 const p=occurrences(scope,[localReminder({...reminder,timezone:'America/New_York',times:['01:30']})],Date.parse('2026-10-31T00:00Z'));
 expect(p.filter(x=>new Date(x.at).toISOString().startsWith('2026-11-01')).map(x=>new Date(x.at).toISOString())).toEqual(['2026-11-01T05:30:00.000Z']);
});
test('capacity limit fails visibly rather than silently omitting later doses',async()=>{const f=fixture();await f.engine.create(scope,async()=>({...reminder,times:Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`)}));expect(f.native.size).toBe(0);expect(f.health()?.status).toBe('error');});
test('only minimum scheduling details are persisted, without token, notes or user ID',async()=>{const f=fixture();await f.engine.create(scope,async()=>({...reminder,note:'private note'}));expect(f.state()[scope].reminders[0]).toEqual({id:1,medicine:'Calcium',times:['10:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'});});
test('successful cancellation cleans its alarms even if permission inspection is broken',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);(f.d.permission as jest.Mock).mockRejectedValue(new Error('permission API'));await f.engine.remove(scope,1,async()=>{});expect(f.native.size).toBe(0);});
test('launch after origin change retries persisted cleanup for previous origin',async()=>{const f=fixture();await f.engine.create(scope,async()=>reminder);(f.d.cancel as jest.Mock).mockRejectedValueOnce(new Error('native'));await f.engine.remove(scope,null,async()=>{});await new NotificationEngine(f.d).refreshCached('https://new.example');expect(f.native.size).toBe(0);});
test('local storage failure does not prevent reading the authoritative medicine list',async()=>{const f=fixture();(f.d.read as jest.Mock).mockRejectedValue(new Error('storage'));await expect(f.engine.refresh(scope,async()=>[reminder])).resolves.toEqual([reminder]);expect(f.health()?.status).toBe('error');});

test.each([5,10] as const)('snooze %i minutes retains the original dose and survives engine restart',async minutes=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);
 const original=occurrences(scope,[localReminder(reminder)],now)[0];f.d.now=()=>original.at+1000;
 const followup=await f.engine.snooze(scope,1,original.at,minutes);
 expect(followup).toMatchObject({scheduledFor:original.at,at:original.at+1000+minutes*60000,identifier:original.identifier+':snooze'});
 const count=(f.d.schedule as jest.Mock).mock.calls.length;
 await new NotificationEngine(f.d).refresh(scope);
 expect(f.native.has(followup.identifier)).toBe(true);expect(f.d.schedule).toHaveBeenCalledTimes(count);
});
test('concurrent snooze taps create only one follow-up; later choice cannot move a pending snooze',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;
 const [first,second]=await Promise.all([f.engine.snooze(scope,1,at,5),f.engine.snooze(scope,1,at,10)]);
 expect(second).toEqual(first);expect(f.state()[scope].snoozes).toHaveLength(1);expect([...f.native.keys()].filter(id=>id.endsWith(':snooze'))).toHaveLength(1);
});
test('Taken and Skip suppress follow-ups; Undo restores only future regular doses',async()=>{
 const f=fixture(),completed=new Set<string>();f.d.completed=async()=>completed;await f.engine.create(scope,async()=>reminder);
 const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;const followup=await f.engine.snooze(scope,1,at,5);
 completed.add(`1:${at}`);await f.engine.refresh(scope);expect(f.native.has(followup.identifier)).toBe(false);
 await expect(f.engine.snooze(scope,1,at,10)).rejects.toThrow('dose completed');
 completed.clear();await f.engine.refresh(scope);expect(f.native.has(followup.identifier)).toBe(false);
});
test('denied permission rejects snooze without writing a successful follow-up',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;
 (f.d.permission as jest.Mock).mockResolvedValue(false);await expect(f.engine.snooze(scope,1,at,5)).rejects.toThrow('notifications denied');expect(f.health()?.status).toBe('denied');expect(f.state()[scope].snoozes).toEqual([]);
});
test('failed native snooze scheduling keeps persisted intent and reports failure; restart retries',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;
 (f.d.schedule as jest.Mock).mockRejectedValueOnce(new Error('native failure'));await expect(f.engine.snooze(scope,1,at,5)).rejects.toThrow('native failure');expect(f.health()?.status).toBe('error');expect(f.state()[scope].snoozes).toHaveLength(1);
 await new NotificationEngine(f.d).refresh(scope);expect([...f.native.keys()].filter(id=>id.endsWith(':snooze'))).toHaveLength(1);
});
test('simultaneous medicines retain independent follow-ups and cancellation only removes its medicine',async()=>{
 const f=fixture();await f.engine.refresh(scope,async()=>[reminder,{...reminder,id:2}]);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;
 await Promise.all([f.engine.snooze(scope,1,at,5),f.engine.snooze(scope,2,at,5)]);expect([...f.native.keys()].filter(id=>id.endsWith(':snooze'))).toHaveLength(2);
 await f.engine.remove(scope,1,async()=>{});expect([...f.native.keys()].filter(id=>id.endsWith(':snooze'))).toHaveLength(1);
});
test('edited, cancelled, future and fabricated doses cannot snooze',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;
 await expect(f.engine.snooze(scope,1,at,5)).rejects.toThrow('invalid dose');f.d.now=()=>at+1;
 await expect(f.engine.snooze(scope,1,at-1000,5)).rejects.toThrow('invalid dose');await f.engine.remove(scope,1,async()=>{});await expect(f.engine.snooze(scope,1,at,5)).rejects.toThrow('invalid dose');
});
test('an interrupted snooze that expires before repair stays visibly unconfirmed; explicit retry recovers it',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const at=occurrences(scope,[localReminder(reminder)],now)[0].at;f.d.now=()=>at+1;
 (f.d.schedule as jest.Mock).mockRejectedValueOnce(new Error('native failure'));await expect(f.engine.snooze(scope,1,at,5)).rejects.toThrow();
 f.d.now=()=>at+6*60000;await new NotificationEngine(f.d).refresh(scope);expect(f.health()).toMatchObject({status:'error',unconfirmedSnoozes:1});expect(f.state()[scope].snoozes).toHaveLength(1);
 await f.engine.snooze(scope,1,at,5);expect(f.health()).toMatchObject({status:'scheduled',unconfirmedSnoozes:0});
});
