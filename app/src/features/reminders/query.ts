import { refreshNotifications, reconcileReminders } from '../notifications/service';
import { startupSpan } from '../../startup/timing';
import { normalizeBase } from '../../services/api/client';

// Shared by screen mount, focus and lifecycle. QueryClient coalesces an in-flight
// operation; a short freshness window also covers the initial focus event.
export function reminderQueryOptions(address:string){
 try{address=normalizeBase(address);}catch{/* Still repair local alarms for an invalid/missing origin. */}
 return {
 queryKey:['reminders',address],retry:false as const,staleTime:1000,
 queryFn:async()=>{
  const finish=startupSpan('reminders.reconcile');
  try{
   const local=startupSpan('notifications.cached-repair');
   await refreshNotifications(false,true);local();
   const result=await reconcileReminders(address);finish();return result;
  }catch(error){finish('error');throw error;}
 },
};}
