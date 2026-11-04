import { LocalReminder } from '../notifications/planner';
import { occurrences } from '../notifications/planner';
import { startupSpan } from '../../startup/timing';

// Display only. Reuse P3's timezone/DST rules without installing any alarms.
export function nextMedicine(reminders:LocalReminder[],now:number){
 if(reminders.length===0)return undefined;
 const finish=startupSpan('display.next-medicine');
 const next=occurrences('display',reminders,now)[0];
 finish();
 if(!next)return undefined;
 return {...next,reminder:reminders.find(r=>r.id===next.reminderId)!};
}
