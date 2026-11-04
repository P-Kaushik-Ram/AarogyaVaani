import { Dose,calendarDate } from './doses';

// Calendar arithmetic, never 24-hour subtraction: local days can be 23/25 hours.
export function recentDays(now:Date){return Array.from({length:7},(_,index)=>new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+index));}
export function savedSummary(rows:Dose[]){
 const doses=[...new Map(rows.map(row=>[row.key,row])).values()];
 const taken=doses.filter(d=>d.status==='taken').length,skipped=doses.filter(d=>d.status==='skipped').length;
 return {taken,skipped,pending:doses.length-taken-skipped,total:doses.length,percent:doses.length?Math.round(taken/doses.length*100):null};
}
export function weeklyProgress(rows:Dose[],now:Date){
 const days=recentDays(now).map(day=>{
  const date=calendarDate(day),doses=rows.filter(dose=>calendarDate(new Date(dose.at))===date).sort((a,b)=>a.at-b.at||a.reminderId-b.reminderId);
  return {day,date,doses,...savedSummary(doses)};
 });
 return {days,...savedSummary(days.flatMap(day=>day.doses)),coveredDays:days.filter(day=>day.total>0).length};
}
