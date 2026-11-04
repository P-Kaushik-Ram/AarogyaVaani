// Production SQLite storage + notification adapter, using a temporary synthetic
// database and mocked Android APIs. This is not physical-device validation.
jest.mock('expo-sqlite',()=>{
 const {DatabaseSync}=require('node:sqlite');const value=new DatabaseSync(':memory:');
 return {openDatabaseAsync:async()=>({execAsync:async(sql:string)=>value.exec(sql),runAsync:async(sql:string,...p:any[])=>value.prepare(sql).run(...p),getFirstAsync:async(sql:string,...p:any[])=>value.prepare(sql).get(...p),getAllAsync:async(sql:string,...p:any[])=>value.prepare(sql).all(...p)})};
});
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-intent-launcher',()=>({startActivityAsync:jest.fn(),ActivityAction:{}}));
jest.mock('expo-notifications',()=>{const state={handler:null};return {
 __state:state,setNotificationHandler:jest.fn(handler=>{state.handler=handler;}),setNotificationChannelAsync:jest.fn(),getPermissionsAsync:jest.fn(),requestPermissionsAsync:jest.fn(),getNotificationChannelAsync:jest.fn(),getAllScheduledNotificationsAsync:jest.fn(),scheduleNotificationAsync:jest.fn(),cancelScheduledNotificationAsync:jest.fn(),dismissNotificationAsync:jest.fn().mockResolvedValue(undefined),getPresentedNotificationsAsync:jest.fn().mockResolvedValue([]),
 AndroidImportance:{HIGH:6,NONE:2},SchedulableTriggerInputTypes:{DATE:'date'},
};});
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example',getApi:jest.fn(),existingTrackingScope:jest.fn().mockResolvedValue('device')}));
import * as N from 'expo-notifications';
import { Platform } from 'react-native';
import { getApi } from '../src/services/api/session';
import { readScheduleState,writeScheduleState } from '../src/services/storage/preferences';
import { saveConfirmed,snoozeDose,refreshNotifications,dismissDoseAlerts,useNotificationHealth,reminderChannel } from '../src/features/notifications/service';
import { notificationIdentity,resolveAlert } from '../src/features/notifications/identity';
import { fullScreenCapability } from '../src/features/notifications/capabilities';
import { clearDoses,readDoses,recordDose } from '../src/features/tracking/storage';
import { weeklyProgress } from '../src/features/tracking/weekly';
import { usePreferences } from '../src/store/preferences';
import { Analysis } from '../src/services/api/models';
const base='https://fixture.example',at=Date.parse('2026-10-17T04:30Z'),id=`av3:${encodeURIComponent(base)}:1:${at}`;
const saved={id:1,user_id:'fixture',medicine:'Synthetic calcium',times:['10:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',updated_at:'2026-10-17T00:00Z',note:null};
const native=new Map<string,any>();
beforeEach(async()=>{
 jest.spyOn(Date,'now').mockReturnValue(at-60000);native.clear();await writeScheduleState({});await clearDoses('device');await refreshNotifications(false,false);
 usePreferences.setState({reminderSound:true,reminderVibration:true});
 (getApi as jest.Mock).mockReturnValue({create:jest.fn().mockResolvedValue(saved)});
 (N.getPermissionsAsync as jest.Mock).mockResolvedValue({granted:true});(N.getNotificationChannelAsync as jest.Mock).mockResolvedValue({importance:6});
 (N.scheduleNotificationAsync as jest.Mock).mockImplementation(async request=>{native.set(request.identifier,request);return request.identifier;});
 (N.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async()=>[...native.values()]);
 (N.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async id=>{native.delete(id);});
 await saveConfirmed(base,{} as Analysis);jest.spyOn(Date,'now').mockReturnValue(at+1000);
});
afterEach(()=>jest.restoreAllMocks());
test.each([5,10] as const)('offline snooze %i keeps the original key pending; completion clears follow-up and Undo updates weekly totals',async minutes=>{
 const transport=jest.spyOn(global,'fetch').mockRejectedValue(new Error('offline'));
 const dose=await resolveAlert(id);expect(dose).toMatchObject({key:`1:${at}`,time:'10:00',date:'2026-10-17'});
 await snoozeDose(base,1,at,minutes);expect(await readDoses('device')).toEqual([]);
 const followup=native.get(id+':snooze');expect(followup.content.data.scheduledFor).toBe(at);expect(followup.trigger.date.getTime()).toBe(at+1000+minutes*60000);
 const taken=await recordDose('device',dose,'taken');await refreshNotifications(false,false);
 expect(native.has(id+':snooze')).toBe(false);expect((await readDoses('device'))[0].key).toBe(dose.key);
 const again=await recordDose('device',dose,'taken');expect(again.recordedAt).toBe(taken.recordedAt);expect(await readDoses('device')).toHaveLength(1);
 expect(weeklyProgress(await readDoses('device'),new Date(at))).toMatchObject({taken:1,total:1});
 await recordDose('device',dose,'pending');expect((await readDoses('device'))[0]).toMatchObject({status:'pending',recordedAt:null});
 expect(transport).not.toHaveBeenCalled();
});
test('Skip and duplicate Skip update exactly the scheduled dose, suppress snooze and preserve Undo',async()=>{
 const dose=await resolveAlert(id);await recordDose('device',dose,'skipped');await recordDose('device',dose,'skipped');
 await expect(snoozeDose(base,1,at,5)).rejects.toThrow('dose completed');expect(await readDoses('device')).toHaveLength(1);
 expect(weeklyProgress(await readDoses('device'),new Date(at))).toMatchObject({skipped:1,taken:0});
 await recordDose('device',dose,'pending');await expect(snoozeDose(base,1,at,5)).resolves.toMatchObject({scheduledFor:at});
});
test('Dismiss only removes the displayed dose notifications, preserving future alerts and SQLite',async()=>{
 await dismissDoseAlerts(base,1,at);expect(N.dismissNotificationAsync).toHaveBeenCalledWith(id);expect(N.dismissNotificationAsync).toHaveBeenCalledWith(id+':snooze');expect(await readDoses('device')).toEqual([]);expect(native.size).toBe(30);
});
test.each([[false,false],[false,true],[true,false]] as const)('channel settings sound %s vibration %s persist native choices without custom beep resources',async(sound,vibration)=>{
 usePreferences.setState({reminderSound:sound,reminderVibration:vibration});await refreshNotifications(false,false);
 expect(reminderChannel()).toBe(`dose-v1-s${Number(sound)}-v${Number(vibration)}`);
 expect(N.setNotificationChannelAsync).toHaveBeenLastCalledWith(reminderChannel(),expect.objectContaining({importance:6,enableVibrate:vibration,bypassDnd:false,...(!sound?{sound:null}:{})}));
 for(const request of native.values()){expect(request.trigger.channelId).toBe(reminderChannel());expect(request.content.sound).toBe(sound?'default':false);}
 const handler=require('expo-notifications').__state.handler;expect(await handler.handleNotification()).toMatchObject({shouldShowBanner:true,shouldPlaySound:sound});
});
test('changing sound cannot bypass the original blocked medicine channel',async()=>{
 usePreferences.setState({reminderSound:false});(N.getNotificationChannelAsync as jest.Mock).mockImplementation(async channel=>({importance:channel==='dose-v1'?2:6}));
 await refreshNotifications(false,false);expect(useNotificationHealth.getState().status).toBe('denied');expect(native.size).toBe(0);
 await expect(snoozeDose(base,1,at,5)).rejects.toThrow('notifications denied');
});
test('notification permission denial never claims snooze success and keeps confirmed details',async()=>{
 (N.getPermissionsAsync as jest.Mock).mockResolvedValue({granted:false,canAskAgain:false});await expect(snoozeDose(base,1,at,5)).rejects.toThrow('notifications denied');
 expect((await readScheduleState() as any)[base].reminders).toHaveLength(1);
});
test.each([28,33,34,35,36,37])('Android %i does not imply full-screen eligibility; standard notifications remain the fallback',version=>{
 jest.replaceProperty(Platform,'OS','android');jest.spyOn(Platform,'Version','get').mockReturnValue(version);expect(fullScreenCapability()).toMatchObject({supported:false,version});
});
test.each(['invalid','av3:%XX:1:123','av3:fixture:0:123','av3:fixture:1:99999999999999999999'])('malformed notification identifiers fail closed: %s',value=>expect(notificationIdentity(value)).toBeNull());
test('old notifications resolve offline from confirmed schedules; fabricated or cancelled occurrences cannot track',async()=>{
 expect((await resolveAlert(id+':snooze')).key).toBe(`1:${at}`);
 await expect(resolveAlert(id.replace(String(at),String(at+1)))).rejects.toThrow('unavailable dose');
 await writeScheduleState({});await expect(resolveAlert(id)).rejects.toThrow('unavailable dose');
});
