import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act,fireEvent,renderAsync,screen,waitFor } from '@testing-library/react-native';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:false,isInternetReachable:false})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example',trackingScope:jest.fn(async()=> 'device'),getApi:jest.fn()}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:()=>mockQuery}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'scheduled',count:30,until:Date.now()+86400000,offline:true})}));
jest.mock('../src/features/tracking/storage',()=>{
 const rows=new Map(),listeners=new Set<any>();
 return {
  reset:()=>{rows.clear();listeners.clear();},
  snapshotDoses:jest.fn(async(_scope:string,doses:any[])=>{for(const d of doses)if(!rows.has(d.key))rows.set(d.key,{...d});}),
  readDoses:jest.fn(async()=>[...rows.values()]),
  recordDose:jest.fn(async(scope:string,dose:any,status:string)=>{const next={...dose,status,recordedAt:status==='pending'?null:new Date().toISOString()};rows.set(dose.key,next);listeners.forEach(fn=>fn(scope));return next;}),
  subscribeDoses:(fn:any)=>{listeners.add(fn);return()=>listeners.delete(fn);},
 };
});
import i18n from '../src/i18n';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { HistoryScreen } from '../src/features/tracking/TrackingUI';
import { recordDose,readDoses } from '../src/features/tracking/storage';
import { router } from 'expo-router';
const reminder={id:7,medicine:'Synthetic calcium',times:['08:00','18:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
let mockQuery:any;
beforeEach(async()=>{
 jest.spyOn(Date,'now').mockReturnValue(new Date(2026,9,17,12).getTime());
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 require('../src/features/tracking/storage').reset();jest.clearAllMocks();
 await i18n.changeLanguage('en');
 mockQuery={data:[reminder],dataUpdatedAt:1,isCached:true,isSuccess:false,isPending:false,isFetching:false,error:new Error('offline'),refetch:jest.fn()};
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
function page(component=<TodayScreen/>){return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider>{component}</ThemeProvider></I18nextProvider>);}
async function press(node:any){await act(async()=>fireEvent.press(node));}

const takenActions=()=>screen.getAllByRole('button',{name:/^Mark dose taken:/});
const statuses=()=>screen.getAllByTestId(/^dose-status-/);

test('offline cached doses mark/undo independently, update progress, survive remount and keep card navigation separate',async()=>{
 const view=await page();await waitFor(()=>expect(takenActions()[0]).toBeEnabled());expect(takenActions()).toHaveLength(2);
 const first=takenActions()[0];await act(async()=>{fireEvent.press(first);fireEvent.press(first);});
 expect(recordDose).toHaveBeenCalledTimes(1);expect(statuses()[0].props.children.join('')).toContain('Taken');expect(statuses()[1].props.children.join('')).toBe('Pending');
 expect(screen.getByText('1 of 2 taken')).toBeTruthy();expect(router.push).not.toHaveBeenCalled();
 await press(screen.getByRole('button',{name:/^Undo taken dose:/}));expect(screen.getByText('0 of 2 taken')).toBeTruthy();
 await press(screen.getAllByRole('button',{name:/^Skip dose:/})[1]);expect(statuses()[1].props.children.join('')).toBe('Skipped');
 expect(screen.getByText('0 of 2 taken')).toBeTruthy();await press(screen.getByRole('button',{name:/^Undo skipped dose:/}));expect(statuses()[1].props.children.join('')).toBe('Pending');
 await press(takenActions()[1]);await view.unmountAsync();await page();await waitFor(()=>expect(screen.getByText('1 of 2 taken')).toBeTruthy());
 expect(statuses()[1].props.children.join('')).toContain('Taken');
 await press(screen.getByTestId('today-reminder-7'));expect(router.push).toHaveBeenCalledWith({pathname:'/reminder/[id]',params:{id:7}});
 await press(screen.getByRole('button',{name:'Medicine history'}));expect(router.push).toHaveBeenCalledWith('/history');
});
test('failed write reports failure without falsely showing Taken or changing progress; retry is possible',async()=>{
 await page();await waitFor(()=>expect(takenActions()[0]).toBeEnabled());
 (recordDose as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
 await press(takenActions()[0]);expect(screen.getByRole('alert',{name:i18n.t('p8.error')})).toBeTruthy();expect(statuses()[0].props.children.join('')).toBe('Pending');expect(screen.getByText('0 of 2 taken')).toBeTruthy();
 await press(takenActions()[0]);expect(screen.getByText('1 of 2 taken')).toBeTruthy();
});
test('history shows saved Pending, Taken and recorded time after Today unmounts; unseen days make no adherence claim',async()=>{
 const today=await page();await waitFor(()=>expect(takenActions()[0]).toBeEnabled());await press(takenActions()[0]);await today.unmountAsync();
 jest.useFakeTimers({now:new Date(2026,9,17,12)});
 await page(<HistoryScreen/>);await waitFor(()=>expect(screen.getAllByText('Synthetic calcium')).toHaveLength(2));
 expect(statuses()[0].props.children.join('')).toContain('Taken');expect(statuses()[1].props.children.join('')).toBe('Pending');expect(screen.getByText(/^Recorded:/)).toBeTruthy();
 await press(screen.getByRole('button',{name:'Previous day'}));expect(screen.getByText(/No saved doses for this date/)).toBeTruthy();
});
test('read failure disables tracking and exposes an explicit refresh action',async()=>{
 (readDoses as jest.Mock).mockRejectedValueOnce(new Error('unreadable'));
 await page();await waitFor(()=>expect(screen.getByRole('alert',{name:i18n.t('p8.error')})).toBeTruthy());expect(takenActions()[0]).toBeDisabled();
 await press(screen.getByRole('button',{name:i18n.t('p8.retry')}));await waitFor(()=>expect(takenActions()[0]).toBeEnabled());
});
test('midnight rollover shows fresh Pending doses without carrying yesterday Taken into progress',async()=>{
 jest.useFakeTimers({now:new Date(2026,9,17,23,59,30)});
 await page();await waitFor(()=>expect(takenActions()[0]).toBeEnabled());await press(takenActions()[0]);expect(screen.getByText('1 of 2 taken')).toBeTruthy();
 await act(async()=>{jest.advanceTimersByTime(60000);});
 await waitFor(()=>expect(screen.getByText('0 of 2 taken')).toBeTruthy());expect(takenActions()).toHaveLength(2);expect(statuses().every(node=>node.props.children.join('')==='Pending')).toBe(true);
 expect((await readDoses('device')).filter(dose=>dose.status==='taken')).toHaveLength(1);
});
test('status changes made by another mounted tracking view refresh Today offline',async()=>{
 await page();await waitFor(()=>expect(takenActions()[0]).toBeEnabled());
 const saved=await readDoses('device');await act(async()=>{await recordDose('device',saved[0],'taken');});
 await waitFor(()=>expect(screen.getByText('1 of 2 taken')).toBeTruthy());
});
