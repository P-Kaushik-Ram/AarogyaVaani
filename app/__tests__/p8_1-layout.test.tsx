import React from 'react';
import { AccessibilityInfo,StyleSheet,View,useWindowDimensions } from 'react-native';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:jest.fn()}));
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:false,isInternetReachable:false})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn()}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:()=>({data:mockReminders,isSuccess:false,isCached:true,refetch:jest.fn()})}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'scheduled',count:30,until:Date.now()+86400000,offline:true})}));
jest.mock('../src/features/tracking/useTracking',()=>({useTracking:()=>({rows:mockDoses,doses:mockDoses,ready:true,busy:mockBusy,change:mockChange})}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { ProgressScreen } from '../src/features/tracking/ProgressScreen';
import { HistoryScreen } from '../src/features/tracking/TrackingUI';
import { Dose } from '../src/features/tracking/doses';
import { router } from 'expo-router';
let mockReminder:any,mockReminders:any[],mockDoses:Dose[],mockBusy=false;
const mockChange=jest.fn();
const names={en:'A long saved medicine name '.repeat(5),hi:'कैल्शियम की दवा का लंबा नाम '.repeat(5),ta:'கால்சியம் மருந்தின் மிக நீண்ட பெயர் '.repeat(5)};
beforeEach(()=>{
 jest.useFakeTimers({now:new Date(2026,9,17,12)});
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.clearAllMocks();mockBusy=false;
 mockReminder={id:7,medicine:names.en,times:['08:00','18:00','20:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
 mockReminders=[mockReminder];
 mockDoses=(['pending','taken','skipped'] as const).map((status,index)=>({key:`7:${index}`,reminderId:7,medicine:mockReminder.medicine,date:'2026-10-17',time:mockReminder.times[index],timezone:'Asia/Kolkata',at:new Date(2026,9,17,8+index).getTime(),status,recordedAt:status==='pending'?null:new Date().toISOString()}));
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
const flat=(node:any)=>StyleSheet.flatten(node.props.style)??{};
function page(component:React.ReactElement,textSize:'standard'|'extraLarge'='standard'){
 return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider textSize={textSize}>{component}</ThemeProvider></I18nextProvider>);
}
const cases=([320,360,412]).flatMap(width=>[1,2].flatMap(fontScale=>(['en','hi','ta'] as const).map(language=>({width,fontScale,language}))));

// Contract checks prevent the exact intrinsic-width/zero-basis combination in
// the Motorola screenshots. Jest does not run native Yoga or measure glyphs.
test.each(cases)('Today and history use bounded full-width dose layouts: $width dp / $fontScale scale / $language',async({width,fontScale,language})=>{
 (useWindowDimensions as jest.Mock).mockReturnValue({width,height:640,scale:2,fontScale});
 await i18n.changeLanguage(language);mockReminder.medicine=names[language];mockDoses=mockDoses.map(d=>({...d,medicine:names[language]}));
 const textSize=fontScale===1?'standard':'extraLarge';
 const today=await page(<TodayScreen/>,textSize);
 const shell=screen.getByTestId('today-medicine-card-7'),header=screen.getByTestId('today-reminder-7');
 expect(flat(shell)).toMatchObject({width:'100%',alignSelf:'stretch',minWidth:0});
 expect(within(shell).getAllByTestId(/^dose-controls-/)).toHaveLength(3);
 expect(within(header).queryAllByTestId(/^dose-controls-/)).toHaveLength(0);
 expect(within(header).getByText(names[language]).props.numberOfLines).toBeUndefined();
 expect(within(header).getByText(names[language]).props.allowFontScaling).toBe(true);
 assertDoseLayouts(width<360||fontScale>1);
 const pending=within(screen.getByTestId('dose-controls-7:0'));
 expect(pending.getByRole('button',{name:i18n.t('p81.takeLabel',{dose:i18n.t('p8.doseLabel',{...mockDoses[0],date:mockDoses[0].date})})})).toBeEnabled();
 expect(pending.getAllByRole('button')).toHaveLength(2);
 await act(async()=>fireEvent.press(pending.getAllByRole('button')[0]));expect(mockChange).toHaveBeenLastCalledWith(mockDoses[0],'taken');expect(router.push).not.toHaveBeenCalled();
 await act(async()=>fireEvent.press(pending.getAllByRole('button')[1]));expect(mockChange).toHaveBeenLastCalledWith(mockDoses[0],'skipped');
 for(const index of [1,2]){
  const control=within(screen.getByTestId(`dose-controls-7:${index}`));expect(control.getAllByRole('button')).toHaveLength(1);expect(control.getByText(i18n.t('p81.undo'))).toBeTruthy();
  await act(async()=>fireEvent.press(control.getAllByRole('button')[0]));expect(mockChange).toHaveBeenLastCalledWith(mockDoses[index],'pending');
 }
 await today.unmountAsync();await page(<HistoryScreen/>,textSize);
 expect(screen.getAllByTestId(/^history-dose-/)).toHaveLength(3);assertDoseLayouts(width<360||fontScale>1);
 for(const dose of mockDoses){
  const card=screen.getByTestId(`history-dose-${dose.key}`);expect(flat(card)).toMatchObject({width:'100%',alignSelf:'stretch',minWidth:0});
  const name=within(card).getByText(names[language]);expect(name.props.numberOfLines).toBeUndefined();expect(flat(name).alignSelf).toBe('stretch');
  expect(within(card).getAllByText(dose.time)).toHaveLength(1);
  expect(within(card).getByText(dose.time).props.numberOfLines).toBe(1);
  if(dose.recordedAt)expect(within(card).getByText(i18n.t('p8.recorded',{timestamp:new Date(dose.recordedAt).toLocaleString()}))).toBeTruthy();
 }
});
function assertDoseLayouts(stacked:boolean){
 for(const dose of mockDoses){
  const block=screen.getByTestId(`dose-controls-${dose.key}`),actions=screen.getByTestId(`dose-actions-${dose.key}`);
  expect(flat(block)).toMatchObject({width:'100%',minWidth:0,alignSelf:'stretch'});expect(flat(block).height).toBeUndefined();expect(flat(block).height).toBeUndefined();
  expect(flat(actions)).toMatchObject({flexDirection:'row',flexWrap:'wrap',maxWidth:'100%'});if(stacked)expect(flat(actions).width).toBe('100%');
  const status=screen.getByTestId(`dose-status-${dose.key}`);expect(flat(status).flexShrink).toBe(1);expect(flat(status).flex).toBeUndefined();expect(status.props.numberOfLines).toBeUndefined();
  for(const button of within(actions).getAllByRole('button')){
   expect(flat(button).minHeight).toBeGreaterThanOrEqual(48);expect(flat(button).height).toBeUndefined();expect(flat(button).minWidth).toBeGreaterThanOrEqual(48);
   expect(flat(button).flex).toBeUndefined();expect(flat(button).maxWidth).toBe('100%');
  }
  for(const text of within(actions).getAllByText(dose.status==='pending'?new RegExp(`${i18n.t('p8.taken')}|${i18n.t('p8.skip')}`):i18n.t('p81.undo'))){
   expect(flat(text).flex).toBeUndefined();expect(flat(text).alignSelf).toBe('stretch');expect(text.props.numberOfLines).toBeUndefined();expect(text.props.allowFontScaling).toBe(true);
  }
 }
}
test('larger in-app text stacks actions even with standard system scale; busy actions remain disabled',async()=>{
 (useWindowDimensions as jest.Mock).mockReturnValue({width:412,height:640,scale:2,fontScale:1});await i18n.changeLanguage('en');mockBusy=true;
 await page(<TodayScreen/>,'extraLarge');assertDoseLayouts(true);
 for(const dose of mockDoses)for(const button of within(screen.getByTestId(`dose-controls-${dose.key}`)).getAllByRole('button'))expect(button).toBeDisabled();
});

 test.each([0,1,6,15,30])('%i reminders keep one scheduled time per card and the Add action accessible',async count=>{
  (useWindowDimensions as jest.Mock).mockReturnValue({width:320,height:640,scale:2,fontScale:1});await i18n.changeLanguage('en');
  mockReminders=Array.from({length:count},(_,i)=>({...mockReminder,id:i+1,times:['08:00']}));
  mockDoses=mockReminders.map(r=>({...mockDoses[0],key:`${r.id}:0`,reminderId:r.id,time:'08:00'}));
  await page(<TodayScreen/>);
  expect(screen.queryAllByTestId(/^today-medicine-card-/)).toHaveLength(count);
  for(const r of mockReminders)expect(within(screen.getByTestId(`today-medicine-card-${r.id}`)).getAllByText('08:00')).toHaveLength(1);
  expect(screen.getByRole('button',{name:i18n.t('p4.addReminder')})).toBeEnabled();
 });

test('offline dashboard distinguishes no data from Pending and exposes day details, timestamps and Undo',async()=>{
 (useWindowDimensions as jest.Mock).mockReturnValue({width:320,height:640,scale:2,fontScale:2});await i18n.changeLanguage('en');
 await page(<ProgressScreen/>,'extraLarge');
 expect(screen.getByText('33% of saved doses marked Taken')).toBeTruthy();expect(screen.getAllByText('No recorded data')).toHaveLength(6);
 expect(screen.getAllByTestId(/^history-dose-/)).toHaveLength(3);expect(screen.getAllByText(/^Recorded:/)).toHaveLength(2);
 await act(async()=>fireEvent.press(screen.getByTestId('progress-day-2026-10-16')));expect(screen.queryAllByTestId(/^history-dose-/)).toHaveLength(0);
 expect(screen.getByText('2026-10-16')).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:'About these records'})));expect(screen.getByText(/Only doses saved when tracking/)).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByTestId('progress-day-2026-10-17')));
 await act(async()=>fireEvent.press(within(screen.getByTestId('dose-controls-7:1')).getByRole('button')));expect(mockChange).toHaveBeenLastCalledWith(mockDoses[1],'pending');
});
