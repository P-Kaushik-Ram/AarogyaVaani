import { occurrences,scopePrefix } from './planner';
import { readCachedReminders } from '../reminders/cache';
import { Dose } from '../tracking/doses';

export function notificationIdentity(identifier:string){
 const match=/^av3:([^:]+):(\d+):(\d+)(:snooze)?$/.exec(identifier);
 if(!match)return null;
 try{
  const scope=decodeURIComponent(match[1]),reminderId=Number(match[2]),at=Number(match[3]);
  if(!Number.isSafeInteger(reminderId)||reminderId<=0||!Number.isSafeInteger(at)||at<=0||!Number.isFinite(new Date(at).getTime()))return null;
  return {scope,reminderId,at};
 }catch{return null;}
}
export async function resolveAlert(identifier:string):Promise<Dose>{
 const identity=notificationIdentity(identifier);if(!identity)throw new Error('invalid notification');
 const {scope,reminderId,at}=identity;
 const reminders=await readCachedReminders(scope);
 const p=occurrences(scope,reminders??[],at-1).find(o=>o.identifier===`${scopePrefix(scope)}${reminderId}:${at}`);
 if(!p)throw new Error('unavailable dose');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
 const part=(key:string)=>date.find(p=>p.type===key)!.value;
 return {key:`${reminderId}:${at}`,reminderId,at,medicine:p.medicine,time:p.time,timezone:p.timezone,date:`${part('year')}-${part('month')}-${part('day')}`,status:'pending',recordedAt:null};
}
