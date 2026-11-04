import { Driver, Health, NotificationEngine, State } from '../src/features/notifications/engine';
import { localReminder, occurrences, scopePrefix } from '../src/features/notifications/planner';
import { Reminder } from '../src/services/api/models';
import { ApiClient, ApiError, CredentialStorage } from '../src/services/api/client';

const scope='https://p14-fixture.example';
const now=Date.parse('2026-10-19T02:00:00Z');
const reminder:Reminder={id:41,user_id:'synthetic',medicine:'P14 Synthetic A',times:['08:00'],days_of_week:'daily',note:null,status:'active',language:'en',timezone:'Asia/Kolkata',updated_at:'2026-10-19T00:00:00Z'};
function fixture(){
 let state:State={},health:Health|undefined;
 const native=new Map<string,string>();
 const d:Driver={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value);},permission:async()=>true,scheduled:async()=>[...native].map(([identifier,signature])=>({identifier,signature})),schedule:jest.fn(async(p,signature)=>{native.set(p.identifier,signature);}),cancel:jest.fn(async id=>{native.delete(id);}),signature:p=>JSON.stringify([p.medicine,p.time,p.timezone]),now:()=>now,health:value=>{health=value;}};
 return {d,native,engine:new NotificationEngine(d),state:()=>state,health:()=>health};
}

test('over-capacity schedule edits remove obsolete alarms before reporting failure, then recover',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);
 const old=[...f.native.keys()];
 const expanded={...reminder,times:Array.from({length:14},(_,i)=>`${String(i+10).padStart(2,'0')}:00`)};
 await f.engine.refresh(scope,async()=>[expanded]);
 expect(f.health()?.status).toBe('error');
 expect(old.some(id=>f.native.has(id))).toBe(false);
 expect(f.d.schedule).toHaveBeenCalledTimes(30); // do not partly install an oversized plan
 expect(f.state()[scope].reminders[0].times).toEqual(expanded.times);
 await new NotificationEngine(f.d).refresh(scope,async()=>[{...reminder,times:['10:00']}]);
 expect(f.health()?.status).toBe('scheduled');expect(f.native.size).toBe(30);
});

test('capacity failure retains still-valid alarms and never cancels another scope',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);
 const valid=[...f.native.keys()],foreign=scopePrefix('https://other-fixture.example')+'99:1';f.native.set(foreign,'foreign');
 await f.engine.refresh(scope,async()=>[{...reminder,times:['08:00',...Array.from({length:13},(_,i)=>`${i+10}:00`)]}]);
 expect(f.health()?.status).toBe('error');expect(valid.every(id=>f.native.has(id))).toBe(true);expect(f.native.get(foreign)).toBe('foreign');
});

test('three daily times and different medicines retain independent deterministic identifiers',async()=>{
 const f=fixture(),rows=[{...reminder,times:['08:00','13:00','21:00']},{...reminder,id:42,medicine:'P14 Synthetic B'}];
 await f.engine.refresh(scope,async()=>rows);expect(f.native.size).toBe(120);
 const before=structuredClone(f.state());await new NotificationEngine(f.d).refreshCached(scope);
 expect(f.state()).toEqual(before);expect(f.d.schedule).toHaveBeenCalledTimes(120);
});

test.each(['server','network','timeout','auth','malformed'] as const)('%s interruption preserves local alarms; successful retry adds no duplicates',async kind=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const before=structuredClone(f.state());
 await expect(f.engine.refresh(scope,async()=>{throw new ApiError(kind);})).rejects.toMatchObject({kind});
 expect(f.state()).toEqual(before);expect(f.native.size).toBe(30);
 await new NotificationEngine(f.d).refresh(scope,async()=>[reminder]);
 expect(f.native.size).toBe(30);expect(f.d.schedule).toHaveBeenCalledTimes(30);expect(f.health()?.offline).toBe(false);
});

test('rapid distinct cancellations and delayed sync cannot resurrect either reminder',async()=>{
 const f=fixture(),second={...reminder,id:42,medicine:'P14 Synthetic B'};await f.engine.refresh(scope,async()=>[reminder,second]);
 let release!:(r:Reminder[])=>void;const response=new Promise<Reminder[]>(resolve=>{release=resolve;});
 const sync=f.engine.refresh(scope,()=>response),first=f.engine.remove(scope,41,async()=>{}),last=f.engine.remove(scope,42,async()=>{});
 release([reminder,second]);await Promise.all([sync,first,last]);
 expect(f.native.size).toBe(0);expect(f.state()[scope].reminders).toEqual([]);
});

test('restart after device-zone change keeps saved-zone instants and missing native alarms are restored',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const ids=[...f.native.keys()];f.native.clear();
 const original=process.env.TZ;
 try{process.env.TZ='Pacific/Honolulu';await new NotificationEngine(f.d).refreshCached(scope);expect([...f.native.keys()]).toEqual(ids);}
 finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test('IST midnight and the next local day resolve to exact UTC instants without past catch-up',()=>{
 const r=localReminder({...reminder,times:['00:00','23:59']});
 const before=Date.parse('2026-10-18T18:29:00Z'),plan=occurrences(scope,[r],before);
 expect(plan.slice(0,3).map(p=>new Date(p.at).toISOString())).toEqual(['2026-10-18T18:30:00.000Z','2026-10-19T18:29:00.000Z','2026-10-19T18:30:00.000Z']);
});

test('a backward clock move can only re-arm an unfinished dose, never an explicitly Taken dose',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);const first=occurrences(scope,[localReminder(reminder)],now)[0];
 f.d.completed=async()=>new Set([`${reminder.id}:${first.at}`]);f.d.now=()=>first.at-60000;
 await f.engine.refreshCached(scope);expect(f.native.has(first.identifier)).toBe(false);
});

test('cancellation of a missing backend ID preserves state until authoritative list reconciliation',async()=>{
 const f=fixture();await f.engine.create(scope,async()=>reminder);
 await expect(f.engine.remove(scope,41,async()=>{throw new ApiError('missing');})).rejects.toMatchObject({kind:'missing'});
 expect(f.native.size).toBe(30);await f.engine.refresh(scope,async()=>[]);expect(f.native.size).toBe(0);
});

test('tunnel-style 530 retries only the read and never rotates the saved identity',async()=>{
 const storage:CredentialStorage={get:jest.fn(async()=> 'synthetic-token'),set:jest.fn(),pending:async()=>false,setPending:jest.fn()};
 const transport=jest.fn().mockResolvedValueOnce({ok:false,status:530}).mockResolvedValueOnce({ok:true,status:200,json:async()=>[reminder]});
 const api=new ApiClient(scope,storage,transport);expect(await api.list()).toEqual([reminder]);
 expect(transport).toHaveBeenCalledTimes(2);expect(storage.set).not.toHaveBeenCalled();
 expect(transport.mock.calls.every(([url])=>url===scope+'/v1/reminders')).toBe(true);
});
