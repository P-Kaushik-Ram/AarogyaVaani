import React from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { renderAsync,screen,fireEvent,waitFor,act } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:()=>true},useLocalSearchParams:()=>({}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>{
 const React=require('react'),{View}=require('react-native');
 return {SafeAreaView:({edges,...props}:any)=>React.createElement(View,props),useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})};
});
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({
 useNotificationHealth:jest.fn(),reconcileReminders:jest.fn(),saveConfirmed:jest.fn(),cancelConfirmed:jest.fn(),
 refreshNotifications:jest.fn(),openNotificationSettings:jest.fn(),openAlarmSettings:jest.fn(),openBatterySettings:jest.fn(),
}));
import { router } from 'expo-router';
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { colors,metrics,ThemeName,TextSize } from '../src/design';
import { GlassCard,GlassLight } from '../src/components/ui/Glass';
import { TodayScreen,MedicinesScreen } from '../src/features/reminders/Screens';
import { TalkScreen } from '../src/features/chat/TalkScreen';
import { SettingsScreen,AboutScreen,HealthScreen } from '../src/features/settings/Screens';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { NotificationStatus } from '../src/features/notifications/Status';
import { useNotificationHealth,reconcileReminders,saveConfirmed,cancelConfirmed,refreshNotifications,openNotificationSettings } from '../src/features/notifications/service';
import { getApi } from '../src/services/api/session';
import { usePreferences } from '../src/store/preferences';
import { Analysis,Reminder } from '../src/services/api/models';
import { nextMedicine } from '../src/features/reminders/presentation';
const longName='Calcium — '+ 'Long medicine name '.repeat(4);
const reminder:Reminder={id:1,user_id:'fixture',medicine:longName,times:['10:00','22:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',updated_at:'2026-10-17T00:00:00Z',note:null};
const analysis:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:longName,times:['10:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'Confirm',language:'en'}};
let health:any,api:any;
beforeEach(async()=>{
 jest.replaceProperty(Platform,'OS','android');
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-17T00:00:00Z'));
 await i18n.changeLanguage('en');usePreferences.setState({language:'en',textSize:'standard',theme:'dark',serverAddress:'',storageError:false});
 health={status:'scheduled',count:60,until:Date.now()+30*86400000,offline:false};
 (useNotificationHealth as unknown as jest.Mock).mockImplementation(()=>health);
 (reconcileReminders as jest.Mock).mockResolvedValue([reminder]);
 api={hasPendingCreate:jest.fn().mockResolvedValue(false),languages:jest.fn().mockResolvedValue([{code:'en'}]),analyze:jest.fn().mockResolvedValue(analysis)};
 (getApi as jest.Mock).mockReturnValue(api);
});
afterEach(()=>jest.restoreAllMocks());
async function renderPage(page:React.ReactElement,theme:ThemeName='dark',textSize:TextSize='standard'){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 return renderAsync(<QueryClientProvider client={client}><I18nextProvider i18n={i18n}><ThemeProvider theme={theme} textSize={textSize}>{page}</ThemeProvider></I18nextProvider></QueryClientProvider>);
}
const locales=['en','hi','ta','ml','kn','te'] as const;
describe.each(locales)('%s UI, scripts and large-text controls',language=>{
 test.each(['dark','hc'] as const)('%s Today and Medicines wrap real names, times and timezone without mutations',async theme=>{
  await i18n.changeLanguage(language);
  const page=await renderPage(<TodayScreen/>,theme,'extraLarge');
  await waitFor(()=>expect(screen.getAllByText(longName)).toHaveLength(2));
  expect(screen.getByRole('header',{name:i18n.t('p4.todayReminders')})).toBeTruthy();
  for(const text of screen.getAllByText(longName)){expect(text.props.numberOfLines).toBeUndefined();expect(text.props.allowFontScaling).toBe(true);expect(text.props.maxFontSizeMultiplier).toBeCloseTo(2/1.5);}
  expect(screen.getByRole('button',{name:i18n.t('p4.addReminder')})).toBeTruthy();
  expect(screen.getByTestId('screen-scroll')).toBeTruthy();
  expect(saveConfirmed).not.toHaveBeenCalled();expect(cancelConfirmed).not.toHaveBeenCalled();expect(refreshNotifications).toHaveBeenCalledWith(false,true);expect((refreshNotifications as jest.Mock).mock.calls.every(([request])=>request!==true)).toBe(true);
  await page.unmountAsync();await renderPage(<MedicinesScreen/>,theme,'extraLarge');
  await waitFor(()=>expect(screen.getByRole('button',{name:new RegExp('Calcium.*10:00, 22:00.*Asia/Kolkata')})).toBeTruthy());
  expect(screen.getByRole('header',{name:i18n.t('p4.yourMedicines')})).toBeTruthy();
 });
 test('Talk and Settings expose translated controls, honest voice state and compact groups',async()=>{
  usePreferences.setState({language});await i18n.changeLanguage(language);
  const page=await renderPage(<TalkScreen/>,'hc','extraLarge');
  expect(screen.getByLabelText(i18n.t('talk.input'))).toBeTruthy();
  expect(screen.getByRole('button',{name:i18n.t('p5.tap')})).toBeEnabled();
  expect(screen.getByRole('button',{name:i18n.t('talk.send')})).toBeDisabled();
  expect(screen.getByRole('button',{name:i18n.t('settings.title')})).toBeTruthy();
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
  await page.unmountAsync();await renderPage(<SettingsScreen/>,'hc','extraLarge');
  expect(screen.getByRole('header',{name:i18n.t('settings.title')})).toBeTruthy();
  expect(screen.getByRole('button',{name:new RegExp(i18n.t('p4.accessibility'))})).toBeTruthy();
  expect(screen.queryByText(i18n.t('settings.advanced'))).toBeNull();
  expect(screen.getByText(i18n.t('about.safety'))).toBeTruthy();
 });
});
test.each(['scheduled','unknown','denied','error'])('%s notification status is explicit and has a recovery link',async status=>{
 health={...health,status,offline:status==='error'};await renderPage(<NotificationStatus/>);
 expect(screen.getByText(i18n.t(`p4.${status}Label`))).toBeTruthy();
 expect(screen.getByText(i18n.t(`p3.${status}`,{count:health.count,until:new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(health.until)}))).toBeTruthy();
 if(status==='scheduled')expect(screen.getByText(i18n.t('p4.refill'))).toBeTruthy();
 if(health.offline)expect(screen.getByText(i18n.t('p3.offline'))).toBeTruthy();
 await act(async()=>{fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.health')}));});
 expect(router.push).toHaveBeenCalledWith('/settings/notification-health');expect(refreshNotifications).not.toHaveBeenCalled();
});
test('Settings and hidden version taps keep normal navigation and developer configuration',async()=>{
 const page=await renderPage(<SettingsScreen/>);
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:new RegExp(i18n.t('settings.language'))})));
 expect(router.push).toHaveBeenCalledWith('/settings/language-voice');
 await page.unmountAsync();jest.clearAllMocks();await renderPage(<AboutScreen/>);
 const version=screen.getByRole('button',{name:i18n.t('settings.version',{version:'1.0.0'})});
 for(let i=0;i<4;i++)await act(async()=>fireEvent.press(version));
 expect(router.push).not.toHaveBeenCalled();await act(async()=>fireEvent.press(version));
 expect(router.push).toHaveBeenCalledWith('/settings/advanced');
});
test('Health recovery remains explicit and rendering never requests permission',async()=>{
 health.status='denied';await renderPage(<HealthScreen/>);expect(refreshNotifications).not.toHaveBeenCalled();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('health.notifications')})));
 expect(openNotificationSettings).toHaveBeenCalledTimes(1);
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('p3.enable')})));
 expect(refreshNotifications).toHaveBeenCalledWith(true);
});
test('floating tabs have selected semantics, safe bottom spacing, growing labels and hide for the keyboard',async()=>{
 const handlers:Record<string,(e:any)=>void>={};
 const addListener=Keyboard.addListener.bind(Keyboard);
 jest.spyOn(Keyboard,'addListener').mockImplementation((event,callback)=>{handlers[event]=callback;return addListener(event,callback);});
 const press=jest.fn();await renderPage(<BottomTabBar><TabButton label={i18n.t('tab.today')} icon={HouseIcon}/><TabButton label={i18n.t('tab.talk')} icon={ChatCircleIcon} isFocused onPress={press}/><TabButton label={i18n.t('tab.medicines')} icon={PillIcon}/></BottomTabBar>,'dark','extraLarge');
 const talk=screen.getByRole('tab',{name:i18n.t('tab.talk')});expect(talk).toBeSelected();await act(async()=>fireEvent.press(talk));expect(press).toHaveBeenCalledTimes(1);
 const footer=screen.getByTestId('navigation-footer');expect(StyleSheet.flatten(footer.props.style).paddingBottom).toBe(24);expect(StyleSheet.flatten(footer.props.style).position).not.toBe('absolute');
 expect(StyleSheet.flatten(talk.props.style).height).toBeUndefined();expect(StyleSheet.flatten(talk.props.style).minHeight).toBeGreaterThanOrEqual(48);
 await act(async()=>handlers.keyboardDidShow({}));expect(StyleSheet.flatten(footer.props.style).display).toBe('none');
 await act(async()=>handlers.keyboardDidHide({}));expect(StyleSheet.flatten(footer.props.style).display).not.toBe('none');
});
test('confirmation is inside the scrollable keyboard-safe screen, Change clears it without saving',async()=>{
 const dismiss=jest.spyOn(Keyboard,'dismiss');await renderPage(<TalkScreen/>);
 await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.t('talk.input')),'Calcium at 10am daily'));
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('talk.send')})));
 await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());
 expect(dismiss).toHaveBeenCalled();
 const scroll=screen.UNSAFE_getByType(ScrollView);expect(scroll.findByProps({testID:'confirmation-card'})).toBeTruthy();
 expect(screen.getByRole('button',{name:i18n.t('action.change')})).toBeEnabled();
 expect(saveConfirmed).not.toHaveBeenCalled();await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.change')})));
 expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(saveConfirmed).not.toHaveBeenCalled();
});
test('high contrast uses opaque cards and suppresses decorative light',async()=>{
 await renderPage(<GlassCard testID="glass"><GlassLight/></GlassCard>,'hc');
 expect(StyleSheet.flatten(screen.getByTestId('glass').props.style).backgroundColor).toBe(colors.hc.surface1);
 expect(screen.UNSAFE_getAllByType(GlassLight).every(light=>light.children.length===0)).toBe(true);
});
test('next medicine uses all times, weekdays, saved zones and skips paused/past reminders without scheduling',()=>{
 const now=Date.parse('2026-10-18T20:00:00Z');
 const next=nextMedicine([{...reminder,id:2,status:'paused',times:['02:00']},{...reminder,times:['01:00','02:00'],days_of_week:[1]}],now)!;
 expect(next.reminderId).toBe(1);expect(next.time).toBe('02:00');expect(next.at).toBe(Date.parse('2026-10-18T20:30:00Z'));
 expect(nextMedicine([],now)).toBeUndefined();expect(saveConfirmed).not.toHaveBeenCalled();
});
