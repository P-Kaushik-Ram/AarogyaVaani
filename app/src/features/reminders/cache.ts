import { readScheduleState } from '../../services/storage/preferences';
import { isReminder } from '../../services/api/models';
import { LocalReminder } from '../notifications/planner';
import { startupSpan } from '../../startup/timing';

// Display the existing minimal confirmed scheduling snapshot, never fabricate a
// server user ID, note or authentication state. This read installs no alarms.
export type DisplayReminder=LocalReminder & {note?:string|null};
export async function readCachedReminders(scope:string):Promise<DisplayReminder[]|undefined>{
 const finish=startupSpan('reminders.cache');
 try{
  const state=await readScheduleState();
  if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('schedule storage');
  const snapshot=(state as Record<string,{reminders?:unknown}>)[scope];
  if(!snapshot){finish();return undefined;}
  const reminders=snapshot.reminders;
  if(!Array.isArray(reminders)||!reminders.every(r=>isReminder({...r,note:null,user_id:'local',language:'en',updated_at:'2026-01-01T00:00:00Z'})))throw new Error('schedule storage');
  finish();return reminders.map(({id,medicine,times,days_of_week,timezone,status})=>({id,medicine,times,days_of_week,timezone,status}));
 }catch{finish('error');return undefined;}
}
