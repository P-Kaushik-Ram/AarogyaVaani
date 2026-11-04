import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { create } from 'zustand';
import i18n from '../../i18n';
import { readScheduleState, writeScheduleState } from '../../services/storage/preferences';
import { apiAddress,notificationScope, getApi,existingTrackingScope } from '../../services/api/session';
import { Analysis, isReminder } from '../../services/api/models';
import { Health, NotificationEngine, State } from './engine';
import { usePreferences } from '../../store/preferences';
import { readDoses,subscribeDoses } from '../tracking/storage';
import { notificationIdentity } from './identity';

export const useNotificationHealth=create<Health>(()=>({status:'unknown',count:0,until:0,offline:false}));
const channelId='dose-v1';
export function reminderChannel(){const p=usePreferences.getState();return p.reminderSound&&p.reminderVibration?channelId:`dose-v1-s${Number(p.reminderSound)}-v${Number(p.reminderVibration)}`;}
Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:usePreferences.getState().reminderSound,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
const engine=new NotificationEngine({
  async read(){
    const state=await readScheduleState() as State;
    if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('schedule storage');
    for(const snapshot of Object.values(state)){
      if(!Array.isArray(snapshot.reminders)||!Array.isArray(snapshot.ids)||!snapshot.ids.every(id=>typeof id==='string')||typeof snapshot.until!=='number')throw new Error('schedule storage');
      for(const r of snapshot.reminders)if(!isReminder({...r,note:null,user_id:'local',language:'en',updated_at:'2026-01-01T00:00:00Z'}))throw new Error('schedule storage');
      if(snapshot.snoozes!==undefined&&(!Array.isArray(snapshot.snoozes)||snapshot.snoozes.some(p=>!notificationIdentity(p.identifier)||!Number.isFinite(p.at)||!Number.isFinite(p.scheduledFor))))throw new Error('snooze storage');
    }
    return state;
  },
  write:writeScheduleState,
  async permission(request){
    // SDK 57 treats a channel sound string as a bundled custom filename. Omitting
    // sound preserves Android's default sound and avoids looking for raw/default.
    const p=usePreferences.getState(),selected=reminderChannel();
    await Notifications.setNotificationChannelAsync(channelId,{name:i18n.t('p3.channel'),importance:Notifications.AndroidImportance.HIGH,enableVibrate:true,bypassDnd:false});
    if(selected!==channelId)await Notifications.setNotificationChannelAsync(selected,{name:i18n.t('p12.channel',{sound:i18n.t(p.reminderSound?'p12.on':'p12.off'),vibration:i18n.t(p.reminderVibration?'p12.on':'p12.off')}),importance:Notifications.AndroidImportance.HIGH,enableVibrate:p.reminderVibration,bypassDnd:false,...(!p.reminderSound?{sound:null}:{})});
    let result=await Notifications.getPermissionsAsync();
    if(request&&!result.granted&&result.canAskAgain)result=await Notifications.requestPermissionsAsync();
    const channel=await Notifications.getNotificationChannelAsync(selected),base=selected===channelId?channel:await Notifications.getNotificationChannelAsync(channelId);
    return result.granted&&channel!==null&&channel.importance!==Notifications.AndroidImportance.NONE&&base!==null&&base.importance!==Notifications.AndroidImportance.NONE;
  },
  async scheduled(){return (await Notifications.getAllScheduledNotificationsAsync()).map(n=>({identifier:n.identifier,signature:typeof n.content.data?.signature==='string'?n.content.data.signature:undefined}));},
  async schedule(p,signature){
    await Notifications.scheduleNotificationAsync({identifier:p.identifier,content:{title:i18n.t('p3.title',{medicine:p.medicine}),body:i18n.t('p3.body',{time:p.time,timezone:p.timezone}),sound:usePreferences.getState().reminderSound?'default':false,data:{reminderId:p.reminderId,scheduledFor:p.scheduledFor??p.at,signature}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(p.at),channelId:reminderChannel()}});
  },
  cancel:Notifications.cancelScheduledNotificationAsync,
  signature:p=>JSON.stringify([p.medicine,p.time,p.timezone,i18n.language,reminderChannel()]),
  now:()=>Date.now(),
  health:value=>useNotificationHealth.setState(value),
  async completed(scope){
    if(!scope)return new Set<string>();
    const tracking=await existingTrackingScope(scope);
    return new Set(tracking?(await readDoses(tracking)).filter(d=>d.status!=='pending').map(d=>d.key):[]);
  },
});
const failed=()=>useNotificationHealth.setState({status:'error',count:0,until:0,offline:false});
export async function refreshNotifications(request=false,force=true){
  try{const base=apiAddress();await engine.refreshCached(base?await notificationScope(base):'',request,force);}catch{failed();}
}
export const snoozeDose=async(scope:string,id:number,at:number,minutes:5|10)=>engine.snooze(await notificationScope(scope),id,at,minutes);
export async function dismissDoseAlerts(scope:string,id:number,at:number){
 scope=await notificationScope(scope);
 const original=`av3:${encodeURIComponent(scope)}:${id}:${at}`;
 for(const identifier of [original,`${original}:snooze`])await Notifications.dismissNotificationAsync(identifier);
}
// Today, History and the reminder screen all write the same SQLite rows. Repair
// pending follow-ups on every change, including Undo, without depending on UI.
subscribeDoses(()=>{
 void (async()=>{
  await refreshNotifications(false,false);
  for(const notification of await Notifications.getPresentedNotificationsAsync()){
   const identity=notificationIdentity(notification.request.identifier);if(!identity)continue;
   const tracking=await existingTrackingScope(identity.scope);if(!tracking)continue;
   if((await readDoses(tracking)).some(d=>d.key===`${identity.reminderId}:${identity.at}`&&d.status!=='pending'))await dismissDoseAlerts(identity.scope,identity.reminderId,identity.at);
  }
 })().catch(failed);
});
export async function reconcileReminders(base=apiAddress()){
  const scope=await notificationScope(base);
  return (await engine.refresh(scope,()=>getApi(scope).list()))!;
}
export const saveConfirmed=async(base:string,analysis:Analysis)=>engine.create(await notificationScope(base),()=>getApi(base).create(analysis,true));
export const cancelConfirmed=async(base:string,id:number)=>engine.remove(await notificationScope(base),id,()=>getApi(base).cancel(id,true));
export const deleteConfirmed=async(base:string)=>engine.remove(await notificationScope(base),null,()=>getApi(base).deleteMe(true));
export async function openNotificationSettings(){try{await Linking.openSettings();}catch{failed();}}
export async function openAlarmSettings(){try{await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM',{data:'package:com.kaushikram.aarogyavaani'});}catch{await openNotificationSettings();}}
export async function openBatterySettings(){try{await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);}catch{await openNotificationSettings();}}
