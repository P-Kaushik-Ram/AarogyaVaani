import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act,fireEvent,renderAsync,screen,waitFor } from '@testing-library/react-native';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('../src/services/storage/preferences',()=>({writePreferences:jest.fn().mockResolvedValue(undefined)}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example',trackingScope:async()=> 'device'}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),canGoBack:()=>false},useLocalSearchParams:()=>mockParams}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'scheduled'}),snoozeDose:jest.fn(),dismissDoseAlerts:jest.fn()}));
jest.mock('../src/features/notifications/identity',()=>({...jest.requireActual('../src/features/notifications/identity'),resolveAlert:jest.fn()}));
jest.mock('expo-notifications',()=>({DEFAULT_ACTION_IDENTIFIER:'default',addNotificationResponseReceivedListener:jest.fn(),getLastNotificationResponse:jest.fn(),clearLastNotificationResponse:jest.fn()}));
jest.mock('../src/features/tracking/storage',()=>{
 const rows=new Map(),listeners=new Set<any>();return {
  reset:()=>{rows.clear();},snapshotDoses:jest.fn(async(_scope:string,doses:any[])=>{for(const d of doses)if(!rows.has(d.key))rows.set(d.key,{...d});}),
  readDoses:jest.fn(async()=>[...rows.values()]),recordDose:jest.fn(async(scope:string,dose:any,status:string)=>{const next={...dose,status,recordedAt:status==='pending'?null:new Date().toISOString()};rows.set(dose.key,next);listeners.forEach(fn=>fn(scope));return next;}),
  subscribeDoses:(fn:any)=>{listeners.add(fn);return()=>listeners.delete(fn);},
 };
});
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { usePreferences } from '../src/store/preferences';
import { recordDose,readDoses } from '../src/features/tracking/storage';
import { resolveAlert } from '../src/features/notifications/identity';
import { snoozeDose,dismissDoseAlerts } from '../src/features/notifications/service';
import { DoseAlertScreen } from '../src/features/notifications/AlertScreen';
import { AlertSettings } from '../src/features/notifications/AlertSettings';
import { NotificationResponses } from '../src/features/notifications/Responses';
import * as N from 'expo-notifications';
import { router } from 'expo-router';
const base='https://fixture.example',at=Date.parse('2026-10-17T04:30Z'),id=`av3:${encodeURIComponent(base)}:1:${at}`;
const dose={key:`1:${at}`,reminderId:1,at,medicine:'Synthetic calcium',time:'10:00',timezone:'Asia/Kolkata',date:'2026-10-17',status:'pending',recordedAt:null};
let mockParams:any;
beforeEach(async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);await i18n.changeLanguage('en');
 require('../src/features/tracking/storage').reset();mockParams={reminderId:'1',notificationId:id};
 usePreferences.setState({ready:true,storageError:false,serverAddress:base,reminderSound:true,reminderVibration:true});
 (resolveAlert as jest.Mock).mockResolvedValue(dose);(snoozeDose as jest.Mock).mockResolvedValue({});(dismissDoseAlerts as jest.Mock).mockResolvedValue(undefined);
 (N.getLastNotificationResponse as jest.Mock).mockReturnValue(null);(N.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({remove:jest.fn()});
});
afterEach(()=>jest.restoreAllMocks());
const page=(component=<DoseAlertScreen/>)=>renderAsync(<ThemeProvider>{component}</ThemeProvider>);
async function ready(){await page();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('p8.taken')})).toBeEnabled());}
async function press(key:string){await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t(key)})));}
test.each(['taken','skipped'] as const)('%s targets the original scheduled dose, rejects double taps and provides Undo',async status=>{
 await ready();expect(screen.getByText('Synthetic calcium')).toBeTruthy();expect(screen.getByText('10:00')).toBeTruthy();
 const button=screen.getByRole('button',{name:i18n.t(status==='taken'?'p8.taken':'p8.skip')});
 await act(async()=>{fireEvent.press(button);fireEvent.press(button);});expect(recordDose).toHaveBeenCalledTimes(1);expect(recordDose).toHaveBeenCalledWith('device',expect.objectContaining({key:dose.key}),status);
 await press('p81.undo');expect((await readDoses('device'))[0]).toMatchObject({status:'pending',recordedAt:null});
});
test.each([5,10] as const)('snooze %i targets the original dose and never records Taken or Skip',async minutes=>{
 await ready();await press(minutes===5?'p12.snooze5':'p12.snooze10');expect(snoozeDose).toHaveBeenCalledWith(base,1,at,minutes);expect(recordDose).not.toHaveBeenCalled();expect(router.replace).toHaveBeenCalledWith('/today');
});
test('Dismiss does not record a choice and removes only displayed notifications',async()=>{
 await ready();await press('p12.dismiss');expect(recordDose).not.toHaveBeenCalled();expect(dismissDoseAlerts).toHaveBeenCalledWith(base,1,at);
});
test('scheduling failure keeps the screen open with an error and leaves the dose Pending',async()=>{
 (snoozeDose as jest.Mock).mockRejectedValue(new Error('permission'));await ready();await press('p12.snooze5');expect(screen.getByRole('alert')).toBeTruthy();expect(recordDose).not.toHaveBeenCalled();expect(router.replace).not.toHaveBeenCalled();
});
test('failed SQLite write cannot display Taken; it remains retryable',async()=>{
 (recordDose as jest.Mock).mockRejectedValueOnce(new Error('disk full'));await ready();await press('p8.taken');expect(screen.getByRole('button',{name:i18n.t('p8.taken')})).toBeEnabled();expect(dismissDoseAlerts).not.toHaveBeenCalled();
});
test('notification from another origin fails closed before lookup or tracking',async()=>{
 mockParams.notificationId=id.replace(encodeURIComponent(base),encodeURIComponent('https://other.example'));await page();await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(resolveAlert).not.toHaveBeenCalled();expect(recordDose).not.toHaveBeenCalled();
});
test('full-screen setting remains visibly off with explanation; sound and vibration are independent',async()=>{
 await page(<AlertSettings/>);const full=screen.getByRole('switch',{name:i18n.t('p12.fullScreen')});expect(full.props.value).toBe(false);expect(full.props.disabled).toBe(true);expect(screen.getByText(i18n.t('p12.fullScreenUnavailable'))).toBeTruthy();
 await act(async()=>fireEvent(screen.getByRole('switch',{name:i18n.t('p12.sound')}),'valueChange',false));expect(usePreferences.getState()).toMatchObject({reminderSound:false,reminderVibration:true});
});
test('cold-start response and live response route once per notification; simultaneous medicines stay distinct',async()=>{
 const response=(identifier:string)=>({actionIdentifier:'default',notification:{date:at,request:{identifier}}});
 (N.getLastNotificationResponse as jest.Mock).mockReturnValue(response(id));const remove=jest.fn();(N.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({remove});
 const view=await page(<NotificationResponses/>);await waitFor(()=>expect(router.push).toHaveBeenCalledTimes(1));const listener=(N.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
 await act(async()=>{listener(response(id));listener(response(id.replace(':1:',':2:')));listener(response('invalid'));});
 expect(router.push).toHaveBeenCalledTimes(2);expect(router.push).toHaveBeenLastCalledWith({pathname:'/alert/[reminderId]',params:{reminderId:'2',notificationId:encodeURIComponent(id.replace(':1:',':2:'))}});expect(N.clearLastNotificationResponse).toHaveBeenCalledTimes(2);
 await view.unmountAsync();expect(remove).toHaveBeenCalled();
});
