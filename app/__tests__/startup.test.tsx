import React from 'react';
import { View,Text,AccessibilityInfo } from 'react-native';
import { renderAsync,screen,fireEvent,act,waitFor } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('../src/services/storage/preferences',()=>({readPreferences:jest.fn(),writePreferences:jest.fn(),readScheduleState:jest.fn()}));
jest.mock('expo-router',()=>{
 const Text=require('react-native').Text;
 const Stack=()=> <Text>navigation fixture</Text>;Stack.Screen=()=>null;Stack.Protected=()=>null;
 return {Stack,useFocusEffect:()=>{},router:{push:jest.fn()}};
});
jest.mock('expo-splash-screen',()=>({hide:jest.fn()}));
jest.mock('react-native-gesture-handler',()=>({GestureHandlerRootView:require('react-native').View}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaProvider:({children}:any)=>children,SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example',getApi:jest.fn()}));
jest.mock('../src/features/notifications/service',()=>({refreshNotifications:jest.fn().mockResolvedValue(undefined),reconcileReminders:jest.fn(),useNotificationHealth:()=>({status:'unknown',count:0,until:0,offline:false})}));
import Root from '../app/_layout';
import * as Splash from 'expo-splash-screen';
import { readPreferences,readScheduleState } from '../src/services/storage/preferences';
import { reconcileReminders,refreshNotifications } from '../src/features/notifications/service';
import { usePreferences } from '../src/store/preferences';
import { StartupProvider,useStartup } from '../src/startup/Startup';
import { useReminders } from '../src/features/reminders/data';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { getApi } from '../src/services/api/session';
import i18n from '../src/i18n';
const local={id:1,medicine:'Confirmed local medicine',times:['20:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
let client:QueryClient;
beforeEach(()=>{
 client=new QueryClient({defaultOptions:{queries:{gcTime:0}}});
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 (readScheduleState as jest.Mock).mockResolvedValue({'https://fixture.example':{reminders:[local],ids:[],until:0}});
 (reconcileReminders as jest.Mock).mockImplementation(()=>new Promise(()=>{}));
 (getApi as jest.Mock).mockReturnValue({hasPendingCreate:jest.fn().mockResolvedValue(true)});
 usePreferences.setState({ready:false,language:'en',onboarded:true,serverAddress:'https://fixture.example'});
});
afterEach(()=>{client.clear();jest.restoreAllMocks();});
test('local shell lays out and hides splash while SQLite is pending; routing waits for saved preferences',async()=>{
 let resolve!:(v:unknown)=>void;(readPreferences as jest.Mock).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const view=await renderAsync(<Root/>);
 expect(screen.getByRole('progressbar')).toBeTruthy();expect(screen.queryByText('navigation fixture')).toBeNull();
 expect(screen.getByTestId('brand-symbol').props.source).toEqual(require('../assets/branding/aarogyavaani_app_icon.png'));
 expect(screen.getByTestId('brand-symbol').props.resizeMode).toBe('contain');
 const layout=screen.UNSAFE_getAllByType(View).find(v=>v.props.onLayout)!;
 await act(async()=>fireEvent(layout,'layout',{}));expect(Splash.hide).toHaveBeenCalledTimes(1);expect(reconcileReminders).not.toHaveBeenCalled();
 await act(async()=>resolve({language:'hi',onboarded:true,theme:'hc',textSize:'extraLarge',reduceMotion:true}));
 expect(screen.getByText('navigation fixture')).toBeTruthy();expect(usePreferences.getState()).toMatchObject({language:'hi',theme:'hc',textSize:'extraLarge',reduceMotion:true});
 expect(readPreferences).toHaveBeenCalledTimes(1);expect(reconcileReminders).not.toHaveBeenCalled();
 await view.unmountAsync();await i18n.changeLanguage('en');
});
test('route layout yields two frames before background work; cleanup cancels pending frames',async()=>{
 const frames:FrameRequestCallback[]=[];jest.spyOn(global,'requestAnimationFrame').mockImplementation(fn=>{frames.push(fn);return frames.length;});
 const cancel=jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
 function Route(){const {backgroundReady,routeLaidOut}=useStartup();return <View onLayout={routeLaidOut}><Text>{String(backgroundReady)}</Text></View>;}
 const view=await renderAsync(<StartupProvider><Route/></StartupProvider>);
 await act(async()=>fireEvent(screen.UNSAFE_getAllByType(View)[0],'layout',{}));expect(screen.getByText('false')).toBeTruthy();
 await act(async()=>frames[0](0));expect(screen.getByText('false')).toBeTruthy();await act(async()=>frames[1](16));expect(screen.getByText('true')).toBeTruthy();
 await view.unmountAsync();expect(cancel).toHaveBeenCalledTimes(2);
});
test('Today shows minimal persisted data before a hung backend, labels it cached and never acknowledges an uncertain save',async()=>{
 await renderAsync(<QueryClientProvider client={client}><TodayScreen/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getAllByText(local.medicine).length).toBeGreaterThan(0));
 expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();expect(screen.queryByText(i18n.t('p2.reviewed'))).toBeNull();
 expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
 expect(getApi).not.toHaveBeenCalled();expect(refreshNotifications).toHaveBeenCalledTimes(1);expect(reconcileReminders).toHaveBeenCalledTimes(1);
});
test('cached data survives backend failure; corrupt cache cannot invent an empty success',async()=>{
 (reconcileReminders as jest.Mock).mockRejectedValue(new Error('network'));
 function Probe(){const q=useReminders();return <><Text>{q.data?.[0]?.medicine??'no data'}</Text><Text>{q.isCached?'cached':'remote'}</Text><Text>{q.isError?'error':'pending'}</Text></>;}
 const view=await renderAsync(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByText(local.medicine)).toBeTruthy());expect(screen.getByText('cached')).toBeTruthy();expect(screen.getByText('error')).toBeTruthy();await view.unmountAsync();client.clear();
 (readScheduleState as jest.Mock).mockResolvedValue({'https://fixture.example':{reminders:[{...local,times:['bad']}]}});
 await renderAsync(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);await waitFor(()=>expect(screen.getByText('error')).toBeTruthy());expect(screen.getByText('no data')).toBeTruthy();expect(screen.getByText('remote')).toBeTruthy();
});
test('a different backend origin never displays another origin cache',async()=>{
 (readScheduleState as jest.Mock).mockResolvedValue({'https://other.example':{reminders:[local]}});
 function Probe(){const q=useReminders();return <Text>{q.data?.[0]?.medicine??'no data'}</Text>;}
 await renderAsync(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);expect(screen.getByText('no data')).toBeTruthy();expect(screen.queryByText(local.medicine)).toBeNull();
});
test('a mounted reminder screen cannot start background work until route layout and frame yielding',async()=>{
 const frames:FrameRequestCallback[]=[];jest.spyOn(global,'requestAnimationFrame').mockImplementation(fn=>{frames.push(fn);return frames.length;});
 function Probe(){const {routeLaidOut}=useStartup();useReminders();return <View testID="route" onLayout={routeLaidOut}/>;}
 await renderAsync(<QueryClientProvider client={client}><StartupProvider><Probe/></StartupProvider></QueryClientProvider>);
 expect(refreshNotifications).not.toHaveBeenCalled();expect(reconcileReminders).not.toHaveBeenCalled();
 await act(async()=>fireEvent(screen.getByTestId('route'),'layout',{}));expect(refreshNotifications).not.toHaveBeenCalled();
 await act(async()=>frames[0](0));expect(refreshNotifications).not.toHaveBeenCalled();
 await act(async()=>frames[1](16));await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(1));expect(refreshNotifications).toHaveBeenCalledTimes(1);
});
test('repeated manual refresh joins an in-flight request instead of cancelling and queueing another',async()=>{
 function Probe(){const q=useReminders();return <Text accessibilityRole="button" onPress={()=>{void q.refetch();void q.refetch();}}>refresh fixture</Text>;}
 client.setQueryData(['reminders','https://fixture.example'],[]);
 await renderAsync(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);
 await act(async()=>fireEvent.press(screen.getByText('refresh fixture')));
 await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(1));expect(refreshNotifications).toHaveBeenCalledTimes(1);
});
