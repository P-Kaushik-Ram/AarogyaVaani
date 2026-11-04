jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-notifications',()=>({
 setNotificationHandler:jest.fn(),setNotificationChannelAsync:jest.fn(),getPermissionsAsync:jest.fn(),requestPermissionsAsync:jest.fn(),getNotificationChannelAsync:jest.fn(),getAllScheduledNotificationsAsync:jest.fn(),scheduleNotificationAsync:jest.fn(),cancelScheduledNotificationAsync:jest.fn(),
 AndroidImportance:{HIGH:4,NONE:0},SchedulableTriggerInputTypes:{DATE:'date'},
}));
jest.mock('expo-intent-launcher',()=>({startActivityAsync:jest.fn(),ActivityAction:{IGNORE_BATTERY_OPTIMIZATION_SETTINGS:'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'}}));
jest.mock('../src/services/storage/preferences',()=>({readScheduleState:jest.fn(),writeScheduleState:jest.fn()}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example',getApi:jest.fn(),existingTrackingScope:jest.fn().mockResolvedValue(null)}));
jest.mock('../src/features/tracking/storage',()=>({readDoses:jest.fn(),subscribeDoses:jest.fn()}));
import * as N from 'expo-notifications';
import * as I from 'expo-intent-launcher';
import { readScheduleState,writeScheduleState } from '../src/services/storage/preferences';
import { getApi } from '../src/services/api/session';
import { saveConfirmed,cancelConfirmed,refreshNotifications,reconcileReminders,useNotificationHealth,openAlarmSettings } from '../src/features/notifications/service';
import { Analysis } from '../src/services/api/models';
import i18n from '../src/i18n';
let api:any,state:any;
const saved={id:1,user_id:'fixture',medicine:'Authoritative Calcium',times:['10:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',updated_at:'2026-10-17T00:00:00Z',note:'Do not put this in notifications'};
beforeEach(()=>{
 state={};(readScheduleState as jest.Mock).mockImplementation(async()=>JSON.parse(JSON.stringify(state)));(writeScheduleState as jest.Mock).mockImplementation(async v=>{state=JSON.parse(JSON.stringify(v));});
 (N.getPermissionsAsync as jest.Mock).mockResolvedValue({granted:true,canAskAgain:true});(N.requestPermissionsAsync as jest.Mock).mockResolvedValue({granted:true});(N.getNotificationChannelAsync as jest.Mock).mockResolvedValue({importance:4});(N.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
 api={create:jest.fn().mockResolvedValue(saved),cancel:jest.fn().mockResolvedValue({deleted:true}),list:jest.fn().mockResolvedValue([saved])};(getApi as jest.Mock).mockReturnValue(api);
 useNotificationHealth.setState({status:'unknown',count:0,until:0,offline:false});
});
test('native adapter schedules only authoritative saved details with absolute date triggers and channel',async()=>{
 await saveConfirmed('https://fixture.example',{draft:{medicine:'draft name'}} as Analysis);
 const request=(N.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
 expect(request.content.title).toBe('Medicine reminder: Authoritative Calcium');expect(request.content.body).toBe('Scheduled time: 10:00 (Asia/Kolkata)');expect(request.content.body).not.toContain(saved.note);
 expect(request.trigger).toEqual({type:'date',date:expect.any(Date),channelId:'dose-v1'});expect(useNotificationHealth.getState().status).toBe('scheduled');expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('Android channel is created before an explicit permission request',async()=>{
 (N.getPermissionsAsync as jest.Mock).mockResolvedValue({granted:false,canAskAgain:true});await refreshNotifications(true);
 expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('dose-v1',expect.objectContaining({importance:4,enableVibrate:true}));
 expect((N.setNotificationChannelAsync as jest.Mock).mock.calls[0][1]).not.toHaveProperty('sound');
 expect((N.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((N.requestPermissionsAsync as jest.Mock).mock.invocationCallOrder[0]);expect(useNotificationHealth.getState().status).toBe('scheduled');
});

test('SDK 57 channel options never request a default custom resource; content keeps supported default sound and channel',async()=>{
 (N.setNotificationChannelAsync as jest.Mock).mockImplementationOnce(async(_id,options)=>{
  if(Object.prototype.hasOwnProperty.call(options,'sound'))throw new Error("Custom sound 'default' not found in native app");
  return {id:'dose-v1',importance:4,sound:'default'};
 });
 await saveConfirmed('https://fixture.example',{} as Analysis);
 expect(N.scheduleNotificationAsync).toHaveBeenCalled();
 for(const [request] of (N.scheduleNotificationAsync as jest.Mock).mock.calls){expect(request.content.sound).toBe('default');expect(request.trigger.channelId).toBe('dose-v1');expect(request.trigger.type).toBe('date');}
 expect(useNotificationHealth.getState().status).toBe('scheduled');
});
test('denied permission is visible and cannot silently schedule',async()=>{
 (N.getPermissionsAsync as jest.Mock).mockResolvedValue({granted:false,canAskAgain:false});await saveConfirmed('https://fixture.example',{} as Analysis);
 expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();expect(useNotificationHealth.getState().status).toBe('denied');expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('blocked Android channel does not claim active alerts',async()=>{(N.getNotificationChannelAsync as jest.Mock).mockResolvedValue({importance:0});await saveConfirmed('https://fixture.example',{} as Analysis);expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();expect(useNotificationHealth.getState().status).toBe('denied');});
test('native module or storage failure reports error without losing successful server Save',async()=>{
 (readScheduleState as jest.Mock).mockRejectedValueOnce(new Error('SQLite'));await expect(saveConfirmed('https://fixture.example',{} as Analysis)).resolves.toEqual(saved);expect(useNotificationHealth.getState().status).toBe('error');
});
test('failed server cancellation never cancels native alarms',async()=>{api.cancel.mockRejectedValue(new Error('network'));await expect(cancelConfirmed('https://fixture.example',1)).rejects.toThrow('network');expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();});
test('reconciliation timeout preserves cached native-independent scheduling details',async()=>{
 await saveConfirmed('https://fixture.example',{} as Analysis);api.list.mockRejectedValue(new Error('timeout'));await expect(reconcileReminders()).rejects.toThrow('timeout');expect(state['https://fixture.example'].reminders).toHaveLength(1);expect(useNotificationHealth.getState().offline).toBe(true);
});
test('special-access recovery opens exact-alarm settings for the installed package',async()=>{await openAlarmSettings();expect(I.startActivityAsync).toHaveBeenCalledWith('android.settings.REQUEST_SCHEDULE_EXACT_ALARM',{data:'package:com.kaushikram.aarogyavaani'});});
test('origin normalization shares scheduling state for equivalent server addresses',async()=>{await saveConfirmed('https://fixture.example/',{} as Analysis);expect(Object.keys(state)).toEqual(['https://fixture.example']);});

test.each([
 ['en','Medicine reminder: ','Scheduled time: '],
 ['hi','दवा की याद: ','निर्धारित समय: '],
 ['ta','மருந்து நினைவூட்டல்: ','குறித்த நேரம்: '],
 ['ml','മരുന്ന് ഓർമ്മപ്പെടുത്തൽ: ','നിശ്ചിത സമയം: '],
 ['kn','ಔಷಧ ನೆನಪು: ','ನಿಗದಿತ ಸಮಯ: '],
 ['te','మందు రిమైండర్: ','నిర్దేశిత సమయం: '],
])('P14 adapter preserves authoritative medicine and saved-zone time in %s notifications',async(language,title,body)=>{
 const previous=i18n.language;
 try{
  await i18n.changeLanguage(language);await saveConfirmed('https://fixture.example',{} as Analysis);
  const requests=(N.scheduleNotificationAsync as jest.Mock).mock.calls.map(([request])=>request);
  expect(requests.length).toBe(30);
  for(const request of requests){
   expect(request.content.title).toBe(title+saved.medicine);
   expect(request.content.body).toBe(body+'10:00 (Asia/Kolkata)');
   expect(request.trigger.date.getUTCMinutes()).toBe(30);
   expect(request.content.body).not.toContain(saved.note);
  }
 }finally{await i18n.changeLanguage(previous);}
});
