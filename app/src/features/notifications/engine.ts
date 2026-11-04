import { Reminder } from '../../services/api/models';
import { localReminder, LocalReminder, Occurrence, occurrences, scopePrefix } from './planner';

type Snooze=Occurrence & {armed?:boolean};
export type Snapshot = {reminders:LocalReminder[];ids:string[];until:number;snoozes?:Snooze[]};
export type State = Record<string,Snapshot>;
export type Health = {status:'unknown'|'scheduled'|'denied'|'error';count:number;until:number;offline:boolean;unconfirmedSnoozes?:number};
export interface Driver {
  read():Promise<State>;
  write(value:State):Promise<void>;
  permission(request:boolean):Promise<boolean>;
  scheduled():Promise<{identifier:string;signature?:string}[]>;
  schedule(value:Occurrence,signature:string):Promise<void>;
  cancel(id:string):Promise<void>;
  signature(value:Occurrence):string;
  now():number;
  health(value:Health):void;
  completed?(scope:string):Promise<Set<string>>;
}

// One queue covers backend reads/mutations AND local writes, preventing an older
// list response from resurrecting a reminder after successful cancellation.
export class NotificationEngine {
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private driver:Driver){}
  private run<T>(work:()=>Promise<T>):Promise<T>{const next=this.tail.catch(()=>{}).then(work);this.tail=next;return next;}
  private async sync(scope:string,state:State,request=false,offline=false,force=false){
    const d=this.driver,snapshot=state[scope]??{reminders:[],ids:[],until:0};
    const granted=await d.permission(request);
    const completed=await d.completed?.(scope)??new Set<string>();
    const snoozes=(snapshot.snoozes??[]).filter(p=>(p.at>d.now()||!p.armed)&&occurrences(scope,snapshot.reminders,p.scheduledFor!-1).some(o=>o.reminderId===p.reminderId&&o.at===p.scheduledFor)&&!completed.has(`${p.reminderId}:${p.scheduledFor}`));
    const planned=granted?[...occurrences(scope,snapshot.reminders,d.now()),...snoozes.filter(p=>p.at>d.now())].filter(p=>!completed.has(`${p.reminderId}:${p.scheduledFor??p.at}`)):[];
    const desired=new Map(planned.map(p=>[p.identifier,p]));
    const native=await d.scheduled();
    for(const item of native){
      if(item.identifier.startsWith(scopePrefix(scope))&&!desired.has(item.identifier))await d.cancel(item.identifier);
    }
    // Even an oversized edit must retire alarms for removed times. Keep valid
    // existing alarms, but never partly install or silently truncate a new plan.
    if(planned.length>400)throw new Error('schedule capacity');
    for(const p of planned){
      const signature=d.signature(p);
      if(force||!native.some(n=>n.identifier===p.identifier&&n.signature===signature))await d.schedule(p,signature);
    }
    for(const snooze of snoozes)if(snooze.at>d.now())snooze.armed=granted;
    // Never quietly discard a follow-up whose native setup was interrupted and
    // whose due time has passed. Keep a warning until completion or explicit retry.
    const unconfirmedSnoozes=snoozes.filter(p=>p.at<=d.now()&&!p.armed).length;
    const until=granted?d.now()+30*86400000:0;
    state[scope]={...snapshot,snoozes,ids:planned.map(p=>p.identifier),until};
    await d.write(state);
    d.health({status:!granted?'denied':unconfirmedSnoozes?'error':'scheduled',count:planned.length,until,offline,unconfirmedSnoozes});
    return granted;
  }
  private failed(){this.driver.health({status:'error',count:0,until:0,offline:false});}
  private async repair(scope:string,state:State,request=false,offline=false,force=false){try{await this.sync(scope,state,request,offline,force);}catch{this.failed();}}
  refresh(scope:string,fetcher?:()=>Promise<Reminder[]>,request=false,force=false){return this.run(async()=>{
    let state:State;
    try{state=await this.driver.read();}catch{this.failed();return fetcher?await fetcher():undefined;}
    // Repair/refill existing confirmed schedules before any network wait.
    await this.repair(scope,state,request,!!fetcher,force);
    if(!fetcher)return;
    const reminders=await fetcher(); // failure must never replace confirmed state
    state[scope]={...state[scope],reminders:reminders.map(localReminder),ids:state[scope]?.ids??[],until:0};
    await this.driver.write(state);
    await this.repair(scope,state);
    return reminders;
  });}
  refreshCached(scope:string,request=false,force=false){return this.run(async()=>{
    const state=await this.driver.read();
    // Other configured origins retain their confirmed reminders. Also retry
    // persisted deletions after a preference reset or tunnel-origin change.
    for(const key of Object.keys(state).filter(key=>key!==scope))await this.repair(key,state,false,true,force);
    await this.repair(scope,state,request,false,force);
  });}
  create(scope:string,save:()=>Promise<Reminder>){return this.run(async()=>{
    const reminder=await save(); // only authoritative, confirmed server success
    try{
      const state=await this.driver.read(),r=localReminder(reminder),old=state[scope];
      state[scope]={...old,reminders:[...(old?.reminders??[]).filter(v=>v.id!==r.id),r],ids:old?.ids??[],until:0};
      await this.driver.write(state);await this.repair(scope,state);
    }catch{this.failed();} // server save succeeded; never encourage duplicate Save
    return reminder;
  });}
  remove(scope:string,id:number|null,remove:()=>Promise<unknown>){return this.run(async()=>{
    await remove(); // rejected cancellation leaves every schedule intact
    try{
      const state=await this.driver.read(),old=state[scope];
      state[scope]={...old,reminders:(old?.reminders??[]).filter(r=>id!==null&&r.id!==id),ids:old?.ids??[],until:0};
      // Persist the deletion before native cleanup; restart retries orphan cleanup.
      await this.driver.write(state);
      const prefix=scopePrefix(scope)+(id===null?'':`${id}:`);
      for(const item of await this.driver.scheduled())if(item.identifier.startsWith(prefix))await this.driver.cancel(item.identifier);
      await this.repair(scope,state);
    }catch{this.failed();}
  });}
  snooze(scope:string,reminderId:number,scheduledFor:number,minutes:5|10){return this.run(async()=>{
    const d=this.driver,state=await d.read(),snapshot=state[scope];
    const original=occurrences(scope,snapshot?.reminders??[],scheduledFor-1).find(p=>p.reminderId===reminderId&&p.at===scheduledFor);
    if(!original||scheduledFor>d.now()||![5,10].includes(minutes))throw new Error('invalid dose');
    if((await d.completed?.(scope))?.has(`${reminderId}:${scheduledFor}`))throw new Error('dose completed');
    if(!await d.permission(false)){d.health({status:'denied',count:0,until:0,offline:true});throw new Error('notifications denied');}
    const identifier=`${original.identifier}:snooze`;
    const existing=snapshot.snoozes?.find(p=>p.identifier===identifier&&p.at>d.now());
    const followup=existing??{...original,identifier,scheduledFor,at:d.now()+minutes*60000};
    // Persist first so interrupted scheduling can be retried after restart.
    snapshot.snoozes=[...(snapshot.snoozes??[]).filter(p=>p.identifier!==identifier),followup];
    await d.write(state);
    try{if(!await this.sync(scope,state))throw new Error('notifications denied');}catch(error){this.failed();throw error;}
    return followup;
  });}
}
