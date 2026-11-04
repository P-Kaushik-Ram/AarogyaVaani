import React from 'react';
import * as RN from 'react-native';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:jest.fn()}));
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:mockBottomInset,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:jest.fn()}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:jest.fn()}));
// Exercise our real tab composition with a Today route. Native navigation/Yoga
// is unavailable in Jest; retain the installed TabSlot's nonshrinking default.
jest.mock('expo-router/ui',()=>{
 const React=require('react'),{View}=require('react-native');
 return {
  Tabs:({children,...props}:any)=><View {...props} testID="tabs-root">{children}</View>,
  TabSlot:({style}:any)=>{const {TodayScreen}=require('../src/features/reminders/TodayScreen');return <View testID="tab-viewport" style={[{flexGrow:1,flexShrink:0},style]}><TodayScreen/></View>;},
  TabList:({children}:any)=>children,
  TabTrigger:({children,name}:any)=>React.cloneElement(children,{isFocused:name==='today'}),
 };
});
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import TabLayout from '../app/(tabs)/_layout';
import { useReminders } from '../src/features/reminders/data';
import { useNotificationHealth } from '../src/features/notifications/service';
import { getApi } from '../src/services/api/session';
import { Reminder } from '../src/services/api/models';
import { ApiError } from '../src/services/api/client';
import { Health } from '../src/features/notifications/engine';

const reminder:Reminder={id:7,user_id:'fixture',medicine:'Calcium',times:['08:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',note:null,updated_at:'2026-10-17T00:00:00Z'};
let query:any,health:Health,mockBottomInset=24;
beforeEach(async()=>{
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-17T00:00:00Z'));
 jest.spyOn(RN.AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 (RN.useWindowDimensions as jest.Mock).mockReturnValue({width:360,height:640,scale:1,fontScale:1});
 await i18n.changeLanguage('en');mockBottomInset=24;
 query={data:[reminder],dataUpdatedAt:1,isSuccess:true,isPending:false,isFetching:false,error:null,refetch:jest.fn()};
 health={status:'scheduled',count:30,until:Date.now()+30*86400000,offline:false};
 (getApi as jest.Mock).mockReturnValue({hasPendingCreate:jest.fn().mockResolvedValue(false)});
 (useReminders as jest.Mock).mockImplementation(()=>query);
 (useNotificationHealth as unknown as jest.Mock).mockImplementation(()=>health);
});
afterEach(()=>jest.restoreAllMocks());
function page(children:React.ReactElement=<TodayScreen/>,textSize:'standard'|'extraLarge'='standard',theme:'dark'|'hc'='dark'){
 return renderAsync(children,{wrapper:({children})=><I18nextProvider i18n={i18n}><ThemeProvider textSize={textSize} theme={theme}>{children}</ThemeProvider></I18nextProvider>});
}
const card=()=>within(screen.getByTestId('today-reminder-7'));

test.each([0,1,6,15].flatMap(count=>[320,360,412].map(width=>({count,width}))))('$count reminders at $width dp retain one column and Add inside scrolling content above the footer',async({count,width})=>{
 (RN.useWindowDimensions as jest.Mock).mockReturnValue({width,height:640,scale:1,fontScale:1});
 mockBottomInset=width===320?0:24;
 query.data=Array.from({length:count},(_,id)=>({...reminder,id:id+1}));
 await page(<TabLayout/>);
 expect(screen.queryAllByTestId(/^today-reminder-\d+$/)).toHaveLength(count);
 for(const item of screen.queryAllByTestId(/^today-reminder-\d+$/)){
  const style=RN.StyleSheet.flatten(item.props.style);
  expect(style.alignSelf).toBe('stretch');expect(style.flexBasis).toBeUndefined();expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(within(item).getByText('08:00')).toBeTruthy();expect(within(item).getByText(i18n.t('medicine.daily'))).toBeTruthy();
  expect(within(item).getByText(reminder.medicine).props.numberOfLines).toBeUndefined();
 }
 const scroll=screen.UNSAFE_getByType(RN.ScrollView),viewport=RN.StyleSheet.flatten(screen.getByTestId('tab-viewport').props.style);
 expect(within(scroll).getByRole('button',{name:i18n.t('p4.addReminder')})).toBeEnabled();
 expect(within(scroll).queryByTestId('navigation-footer')).toBeNull();
 expect(viewport).toMatchObject({flex:1,flexShrink:1,minHeight:0});
 const footer=RN.StyleSheet.flatten(screen.getByTestId('navigation-footer').props.style);
 expect(footer.position).not.toBe('absolute');expect(footer.flexShrink).toBe(0);expect(footer.paddingBottom).toBe(Math.max(mockBottomInset,8));
 const content=RN.StyleSheet.flatten(scroll.props.contentContainerStyle);
 expect(content.paddingBottom).toBe(16);expect(content.flexGrow).toBeUndefined();
 expect(query.refetch).not.toHaveBeenCalled();
});

test('names wrap with full accessible text; all times remain separate, unbroken and available in detail',async()=>{
 const name='A very long saved medicine name '.repeat(8);
 query.data=[{...reminder,medicine:name,times:['08:00','12:30','18:45','23:00']}];
 await page();
 expect(card().getByText(name).props.numberOfLines).toBeUndefined();
 for(const time of query.data[0].times)expect(within(screen.getByTestId('today-medicine-card-7')).getByText(time).props.numberOfLines).toBe(1);
 const target=screen.getByTestId('today-reminder-7');
 expect(target.props.accessibilityLabel).toContain(name);
 expect(target.props.accessibilityLabel).toContain('08:00, 12:30, 18:45, 23:00');
 expect(target.props.accessibilityLabel).toContain(reminder.timezone);
 expect(card().queryByText(reminder.timezone)).toBeNull();
 expect(card().queryByText(/Device:|Local alerts scheduled/)).toBeNull();
 const {router}=require('expo-router');await act(async()=>fireEvent.press(target));
 expect(router.push).toHaveBeenCalledWith({pathname:'/reminder/[id]',params:{id:7}});
});

test.each(['en','hi','ta'] as const)('%s large text at 320 dp keeps full names, times and translated status without fixed card heights',async language=>{
 await i18n.changeLanguage(language);
 (RN.useWindowDimensions as jest.Mock).mockReturnValue({width:320,height:640,scale:1,fontScale:2});
 const name={en:'Long medicine name ',hi:'बहुत लंबा दवा का नाम ',ta:'நீண்ட மருந்துப் பெயர் '}[language].repeat(8);
 query.data=[{...reminder,medicine:name,times:['08:00','19:00']}];
 await page(<TodayScreen/>,'extraLarge','hc');
 expect(card().getByText(name).props.numberOfLines).toBeUndefined();
 expect(card().getByText(name).props.allowFontScaling).toBe(true);
 expect(within(screen.getByTestId('today-medicine-card-7')).getByText('08:00')).toBeTruthy();expect(within(screen.getByTestId('today-medicine-card-7')).getByText('19:00')).toBeTruthy();
 expect(card().getByText(i18n.t('p6.scheduled'))).toBeTruthy();
 expect(RN.StyleSheet.flatten(screen.getByTestId('today-reminder-7').props.style).height).toBeUndefined();
 expect(screen.getByRole('button',{name:i18n.t('p4.addReminder')})).toBeEnabled();
});

test.each([
 {status:'scheduled',count:30,remaining:86400000,key:'p6.scheduled'},
 {status:'denied',count:30,remaining:86400000,key:'p6.permissionRequired'},
 {status:'error',count:30,remaining:86400000,key:'p6.needsAttention'},
 {status:'unknown',count:0,remaining:0,key:'p6.needsAttention'},
 {status:'scheduled',count:0,remaining:86400000,key:'p6.needsAttention'},
 {status:'scheduled',count:30,remaining:0,key:'p6.needsAttention'},
] as const)('$status / $count alarms / $remaining ms remaining uses $key',async({status,count,remaining,key})=>{
 health={status,count,until:Date.now()+remaining,offline:true};await page();
 expect(card().getByText(i18n.t(key))).toBeTruthy();
 if(key!=='p6.scheduled')expect(card().queryByText(i18n.t('p6.scheduled'))).toBeNull();
 expect(screen.getByRole('button',{name:i18n.t('settings.health')})).toBeEnabled();
});

test('permission and failed scheduling changes replace Scheduled on mounted cards',async()=>{
 const view=await page();expect(card().getByText(i18n.t('p6.scheduled'))).toBeTruthy();
 for(const status of ['denied','error','scheduled'] as const){
  health={...health,status};await view.rerenderAsync(<TodayScreen/>);
  expect(card().getByText(i18n.t(status==='scheduled'?'p6.scheduled':status==='denied'?'p6.permissionRequired':'p6.needsAttention'))).toBeTruthy();
 }
 expect(query.refetch).not.toHaveBeenCalled();
});

test('initial loading ends when persisted reminders arrive during the same pending request',async()=>{
 query={...query,data:undefined,isPending:true,isSuccess:false,isFetching:true};const view=await page();
 expect(screen.getByText(i18n.t('loading.label'))).toBeTruthy();expect(screen.queryByText(i18n.t('p2.todayEmpty'))).toBeNull();
 query={...query,data:[reminder],isCached:true};await view.rerenderAsync(<TodayScreen/>);
 expect(card().getByText(reminder.medicine)).toBeTruthy();expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
 expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();
 expect(screen.getByRole('button',{name:i18n.t('p2.refresh')})).toBeDisabled();expect(query.refetch).not.toHaveBeenCalled();
 query={...query,data:[]};await view.rerenderAsync(<TodayScreen/>);
 expect(screen.getByText(i18n.t('p2.todayEmpty'))).toBeTruthy();expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
});

test('background refresh keeps content, then exposes errors and retry, and recovers to success',async()=>{
 query.isFetching=true;const view=await page();
 expect(card().getByText(reminder.medicine)).toBeTruthy();expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
 query={...query,isFetching:false,isSuccess:false,error:new ApiError('network')};await view.rerenderAsync(<TodayScreen/>);
 expect(card().getByText(reminder.medicine)).toBeTruthy();expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.retry')})));expect(query.refetch).toHaveBeenCalledTimes(1);
 query={...query,isSuccess:true,error:null};await view.rerenderAsync(<TodayScreen/>);
 expect(screen.queryByText(i18n.t('api.network'))).toBeNull();expect(screen.queryByText(i18n.t('p43.cached'))).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('p2.refresh')})));expect(query.refetch).toHaveBeenCalledTimes(2);
});

test('a failed initial request shows retry without an empty-success state or loading banner',async()=>{
 query={...query,data:undefined,isPending:false,isSuccess:false,error:new ApiError('network')};await page();
 expect(within(screen.getByTestId('connection-status')).getByRole('alert')).toHaveTextContent(i18n.t('connection.unavailable'));
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
 expect(screen.getByText(i18n.t('api.network'))).toBeTruthy();expect(screen.queryByText(i18n.t('p2.todayEmpty'))).toBeNull();
 expect(screen.queryByTestId('next-medicine-empty')).toBeNull();expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
});
