import { LocalReminder, occurrences } from '../notifications/planner';

export type DoseStatus='pending'|'taken'|'skipped';
export type Dose={key:string;reminderId:number;medicine:string;date:string;time:string;timezone:string;at:number;status:DoseStatus;recordedAt:string|null};
export function calendarDate(value:Date){return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;}
export function scheduledDoses(reminders:LocalReminder[],day:Date):Dose[]{
 const start=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
 const end=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1).getTime();
 // Same IANA timezone and DST resolver as alarms; no scheduling side effects.
 const found=occurrences('tracking',reminders,start-1).filter(o=>o.at<end);
 return [...new Map(found.map(o=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:o.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(o.at).map(v=>[v.type,v.value]));
  const key=`${o.reminderId}:${o.at}`;
  return [key,{key,reminderId:o.reminderId,medicine:o.medicine,date:`${p.year}-${p.month}-${p.day}`,time:o.time,timezone:o.timezone,at:o.at,status:'pending' as const,recordedAt:null}];
 })).values()];
}
export function progress(doses:Dose[]){const taken=doses.filter(d=>d.status==='taken').length;return {taken,total:doses.length,percent:doses.length?Math.round(taken/doses.length*100):0};}
