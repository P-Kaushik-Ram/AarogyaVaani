import { isReminder, Reminder } from '../../services/api/models';

export const WINDOW_DAYS = 30;
export type LocalReminder = Pick<Reminder,'id'|'medicine'|'times'|'days_of_week'|'timezone'|'status'>;
export type Occurrence = {identifier:string;at:number;reminderId:number;medicine:string;time:string;timezone:string;scheduledFor?:number};
export const scopePrefix=(scope:string)=>`av3:${encodeURIComponent(scope)}:`;
export function localReminder(value:Reminder):LocalReminder {
  if(!isReminder(value) || 'date' in value || 'scheduled_date' in value)throw new Error('unsupported schedule');
  const {id,medicine,times,days_of_week,timezone,status}=value;
  return {id,medicine,times,days_of_week,timezone,status};
}

// Resolve wall-clock minutes using IANA offsets around the target date. Skip a
// nonexistent spring-forward minute; choose the first instant of a repeated minute.
export function occurrences(scope:string,reminders:LocalReminder[],now:number):Occurrence[] {
  const end=now+WINDOW_DAYS*86400000,result:Occurrence[]=[];
  for(const r of reminders){
    if(r.status!=='active')continue;
    const format=new Intl.DateTimeFormat('en-GB',{timeZone:r.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const parts=(ms:number)=>Object.fromEntries(format.formatToParts(ms).map(p=>[p.type,p.value]));
    const start=parts(now),first=Date.UTC(+start.year,+start.month-1,+start.day);
    for(let day=0;day<=WINDOW_DAYS+1;day++){
      const date=new Date(first+day*86400000),isoDay=date.getUTCDay()||7;
      if(r.days_of_week!=='daily'&&!r.days_of_week.includes(isoDay))continue;
      for(const time of r.times){
        const [hour,minute]=time.split(':').map(Number),wall=date.getTime()+hour*3600000+minute*60000;
        const offsets=new Set<number>();
        for(const delta of [-36,-12,0,12,36]){
          const sample=wall+delta*3600000,p=parts(sample);
          offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-sample);
        }
        const candidates=[...offsets].map(offset=>wall-offset).filter(ms=>{
          const p=parts(ms);return +p.year===date.getUTCFullYear()&&+p.month===date.getUTCMonth()+1&&+p.day===date.getUTCDate()&&+p.hour===hour&&+p.minute===minute;
        }).sort((a,b)=>a-b);
        const at=candidates[0];
        if(at>now&&at<=end)result.push({identifier:`${scopePrefix(scope)}${r.id}:${at}`,at,reminderId:r.id,medicine:r.medicine,time,timezone:r.timezone});
      }
    }
  }
  return result.sort((a,b)=>a.at-b.at);
}
