import React from 'react';
import { AccessibilityInfo,KeyboardAvoidingView,Platform,StyleSheet } from 'react-native';
import { renderAsync,screen,fireEvent,act,waitFor } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { LinearGradient,RadialGradient } from 'react-native-svg';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import fs from 'node:fs';
import path from 'node:path';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:()=>true},useLocalSearchParams:()=>({id:'1'}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/services/storage/preferences',()=>({readPreferences:jest.fn(),writePreferences:jest.fn().mockResolvedValue(undefined)}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,assertAddressAllowed:jest.fn().mockResolvedValue(undefined),getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:jest.fn(),reconcileReminders:jest.fn(),saveConfirmed:jest.fn(),cancelConfirmed:jest.fn(),refreshNotifications:jest.fn(),openNotificationSettings:jest.fn(),openAlarmSettings:jest.fn(),openBatterySettings:jest.fn()}));
import { router } from 'expo-router';
import i18n from '../src/i18n';
import { ThemeProvider,StitchFoundation } from '../src/design/ThemeProvider';
import { colors } from '../src/design';
import { stitchColors } from '../src/design/stitch';
import { TalkScreen } from '../src/features/chat/TalkScreen';
import { MedicinesScreen } from '../src/features/reminders/Screens';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { SettingsScreen,AboutScreen,AdvancedScreen,AppearanceScreen,LanguageVoiceScreen,HealthScreen } from '../src/features/settings/Screens';
import { useNotificationHealth,reconcileReminders,saveConfirmed,cancelConfirmed,refreshNotifications,openNotificationSettings,openAlarmSettings,openBatterySettings } from '../src/features/notifications/service';
import { getApi,assertAddressAllowed } from '../src/services/api/session';
import { ApiError } from '../src/services/api/client';
import { Analysis,Reminder } from '../src/services/api/models';
import { usePreferences } from '../src/store/preferences';
import { writePreferences } from '../src/services/storage/preferences';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';

const base='https://fixture.example';
const reminder:Reminder={id:1,user_id:'fixture',medicine:'Real saved medicine',times:['10:00','19:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',note:null,updated_at:'2026-10-17T00:00:00Z'};
const valid:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:reminder.medicine,times:['10:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'Backend clarification',language:'en'}};
let api:any,health:any;
beforeEach(async()=>{
 jest.replaceProperty(Platform,'OS','android');jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-17T00:00:00Z'));
 await i18n.changeLanguage('en');usePreferences.setState({language:'en',theme:'dark',textSize:'standard',reduceMotion:false,storageError:false,serverAddress:base});
 api={languages:jest.fn().mockResolvedValue([{code:'en'},{code:'hi'},{code:'ta'}]),analyze:jest.fn().mockResolvedValue(valid),hasPendingCreate:jest.fn().mockResolvedValue(false),health:jest.fn().mockResolvedValue({status:'ok',version:'fixture'})};
 health={status:'scheduled',count:60,until:Date.now()+30*86400000,offline:false};
 (getApi as jest.Mock).mockReturnValue(api);(useNotificationHealth as unknown as jest.Mock).mockImplementation(()=>health);
 (reconcileReminders as jest.Mock).mockResolvedValue([reminder]);(saveConfirmed as jest.Mock).mockResolvedValue(reminder);(cancelConfirmed as jest.Mock).mockResolvedValue(undefined);
});
afterEach(()=>jest.restoreAllMocks());
async function page(children:React.ReactNode,theme:'dark'|'hc'='dark',seed?:Reminder[]){
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 if(seed)cache.setQueryData(['reminders',base],seed,{updatedAt:Date.now()-2000});
 return renderAsync(<QueryClientProvider client={cache}><I18nextProvider i18n={i18n}><ThemeProvider theme={theme}><StitchFoundation>{children}</StitchFoundation></ThemeProvider></I18nextProvider></QueryClientProvider>);
}
async function press(name:string){await act(async()=>fireEvent.press(screen.getByRole('button',{name})));}
async function check(){await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.t('talk.input')),'Real saved medicine at 10am daily'));await press(i18n.t('talk.send'));}
async function openManage(){await waitFor(()=>expect(screen.getByTestId('medicine-card-1')).toBeTruthy());await press(i18n.t('p43.manage',{medicine:reminder.medicine}));}

test('Talk microphone is enabled, confirmation has real fields and duplicate Save submits only once',async()=>{
 await page(<TalkScreen/>);expect(screen.getByRole('button',{name:i18n.t('p5.tap')})).toBeEnabled();
 expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(screen.getByText(i18n.t('p43.createReminder'))).toBeTruthy();
 expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
 await check();expect(screen.getByTestId('confirmation-card')).toBeTruthy();expect(screen.getByText(i18n.t('p42.time')+': 10:00')).toBeTruthy();
 expect(screen.getByText(i18n.t('medicine.name'))).toBeTruthy();expect(saveConfirmed).not.toHaveBeenCalled();
 let resolve!:(value:Reminder)=>void;(saveConfirmed as jest.Mock).mockImplementation(()=>new Promise<Reminder>(done=>{resolve=done;}));
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await act(async()=>{fireEvent.press(save);fireEvent.press(save);});
 expect(saveConfirmed).toHaveBeenCalledTimes(1);expect(saveConfirmed).toHaveBeenCalledWith(base,valid);
 await act(async()=>resolve(reminder));expect(screen.getByText(i18n.t('reminder.saved'))).toBeTruthy();expect(screen.queryByTestId('confirmation-card')).toBeNull();
});

test.each(['safety','missing','nullRecurrence','unsupported'] as const)('Talk %s response never exposes a confirmation or Save',async kind=>{
 const result={...valid,draft:{...valid.draft!}};
 if(kind==='safety')result.safety={triggered:true,reason:'medical'};
 if(kind==='missing'){result.missing=['frequency'];result.draft.days_of_week=null;}
 if(kind==='nullRecurrence')result.draft.days_of_week=null;
 if(kind==='unsupported')result.detected_language='unsupported';
 api.analyze.mockResolvedValue(result);await page(<TalkScreen/>);await check();
 expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(saveConfirmed).not.toHaveBeenCalled();
 if(kind==='safety')expect(screen.getByText(i18n.t('care.body'))).toBeTruthy();
});

test('Talk Change dismisses confirmation while preserving the editable command',async()=>{
 await page(<TalkScreen/>);await check();await press(i18n.t('action.change'));
 expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(screen.getByLabelText(i18n.t('talk.input')).props.value).toContain('10am daily');expect(saveConfirmed).not.toHaveBeenCalled();
});

test('Medicines management and confirmation can each close without cancelling; only explicit final Delete cancels',async()=>{
 await page(<MedicinesScreen/>);await openManage();expect(cancelConfirmed).not.toHaveBeenCalled();
 await press(i18n.t('action.delete'));expect(screen.getByRole('header',{name:i18n.t('medicine.deleteTitle',{medicine:reminder.medicine})})).toBeTruthy();
 expect(cancelConfirmed).not.toHaveBeenCalled();await press(i18n.t('action.cancel'));expect(cancelConfirmed).not.toHaveBeenCalled();
 await openManage();await press(i18n.t('action.close'));expect(cancelConfirmed).not.toHaveBeenCalled();
 await openManage();await press(i18n.t('action.delete'));
 let resolve!:()=>void;(cancelConfirmed as jest.Mock).mockImplementation(()=>new Promise<void>(done=>{resolve=done;}));
 const remove=screen.getByRole('button',{name:i18n.t('action.delete')});await act(async()=>{fireEvent.press(remove);fireEvent.press(remove);});
 expect(cancelConfirmed).toHaveBeenCalledTimes(1);expect(cancelConfirmed).toHaveBeenCalledWith(base,1);
 await act(async()=>resolve());expect(screen.getByText(i18n.t('medicine.removed'))).toBeTruthy();
});

test('failed medicine cancellation remains visible and retains the saved card',async()=>{
 (cancelConfirmed as jest.Mock).mockRejectedValue(new ApiError('network'));await page(<MedicinesScreen/>);await openManage();await press(i18n.t('action.delete'));await press(i18n.t('action.delete'));
 expect(screen.getByText(i18n.t('api.network'))).toBeTruthy();expect(screen.getByText(i18n.t('medicine.deleteBody'))).toBeTruthy();
 expect(screen.queryByText(i18n.t('medicine.removed'))).toBeNull();await press(i18n.t('action.cancel'));expect(screen.getByTestId('medicine-card-1')).toBeTruthy();
});

test('medicine detail and Add preserve routing; management target is at least 48 dp',async()=>{
 await page(<MedicinesScreen/>);await openManage();const name=i18n.t('p43.manage',{medicine:reminder.medicine});
 await press(i18n.t('p43.details'));expect(router.push).toHaveBeenCalledWith({pathname:'/reminder/[id]',params:{id:1}});
 const target=StyleSheet.flatten(screen.getByRole('button',{name}).props.style);expect(target.minHeight).toBeGreaterThanOrEqual(48);expect(target.minWidth).toBeGreaterThanOrEqual(48);
 await press(i18n.t('p4.addReminder'));expect(router.push).toHaveBeenCalledWith('/talk');expect(cancelConfirmed).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
});

test('Medicines retains last loaded data with explicit cache and API error notices during failed sync',async()=>{
 (reconcileReminders as jest.Mock).mockRejectedValue(new ApiError('network'));
 await page(<MedicinesScreen/>,'dark',[reminder]);await waitFor(()=>expect(screen.getByText(i18n.t('connection.unavailable'))).toBeTruthy());
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
 expect(screen.getByText(i18n.t('api.network'))).toBeTruthy();
 expect(screen.getByTestId('medicine-card-1')).toBeTruthy();expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();expect(screen.queryByText(i18n.t('medicine.empty'))).toBeNull();
});

test('Settings exposes five sections, About retains Privacy and five-tap hidden Advanced access',async()=>{
 const view=await page(<SettingsScreen/>);
 for(const [key,path] of [['health.notifications','/settings/notification-health'],['settings.language','/settings/language-voice'],['settings.appearance','/settings/text-theme'],['p4.accessibility','/settings/text-theme'],['settings.about','/settings/about']]){
  await act(async()=>fireEvent.press(screen.getByRole('button',{name:new RegExp(i18n.t(key))})));expect(router.push).toHaveBeenCalledWith(path);
 }
 expect(screen.queryByText(i18n.t('settings.advanced'))).toBeNull();await view.unmountAsync();jest.clearAllMocks();await page(<AboutScreen/>);
 await press(i18n.t('settings.privacy'));expect(router.push).toHaveBeenCalledWith('/settings/privacy');jest.clearAllMocks();
 const version=i18n.t('settings.version',{version:'1.0.0'});for(let i=0;i<4;i++)await press(version);expect(router.push).not.toHaveBeenCalled();await press(version);expect(router.push).toHaveBeenCalledWith('/settings/advanced');
});

test('Advanced still checks the edited backend and saves a normalized valid HTTPS origin',async()=>{
 await page(<AdvancedScreen/>);await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.t('settings.server')),'https://new-fixture.example/'));
 await press(i18n.t('action.check'));expect(getApi).toHaveBeenCalledWith('https://new-fixture.example/');expect(api.health).toHaveBeenCalledTimes(1);expect(screen.getByText(i18n.t('p2.connected'))).toBeTruthy();
 await press(i18n.t('action.save'));expect(usePreferences.getState().serverAddress).toBe('https://new-fixture.example');expect(writePreferences).toHaveBeenCalled();
 await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.t('settings.server')),'http://invalid.example'));await press(i18n.t('action.save'));
 expect(screen.getByText(i18n.t('api.config'))).toBeTruthy();expect(usePreferences.getState().serverAddress).toBe('https://new-fixture.example');
});

test('Language, text size, high contrast and motion controls still persist preferences',async()=>{
 const view=await page(<LanguageVoiceScreen/>);await act(async()=>fireEvent.press(screen.getAllByRole('radio')[2]));
 expect(usePreferences.getState().language).toBe('ta');await view.unmountAsync();await i18n.changeLanguage('en');await page(<AppearanceScreen/>);
 await press(i18n.t('settings.extraLarge'));await press(i18n.t('settings.hc'));
 await act(async()=>fireEvent(screen.getByLabelText(i18n.t('settings.reduceMotion')),'valueChange',true));
 expect(usePreferences.getState()).toMatchObject({textSize:'extraLarge',theme:'hc',reduceMotion:true});expect(writePreferences).toHaveBeenCalled();
});

test('Today is compact while full coverage details stay in Health Check and refill stays visible',async()=>{
 const view=await page(<TodayScreen/>);await waitFor(()=>expect(screen.getByTestId('next-medicine')).toBeTruthy());
 const style=StyleSheet.flatten(screen.getByTestId('next-medicine').props.style);expect(style.padding).toBeLessThanOrEqual(12);expect(style.gap).toBeLessThanOrEqual(4);expect(style.height).toBeUndefined();
 expect(screen.queryByText(i18n.t('medicine.name'))).toBeNull();expect(screen.queryByText(i18n.t('p42.time'))).toBeNull();expect(screen.getByText(i18n.t('p4.refill'))).toBeTruthy();
 const detailed=i18n.t('p3.scheduled',{count:health.count,until:new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(health.until)});
 expect(screen.queryByText(detailed)).toBeNull();await press(i18n.t('settings.health'));expect(router.push).toHaveBeenCalledWith('/settings/notification-health');
 await view.unmountAsync();await page(<HealthScreen/>);expect(screen.getByText(detailed)).toBeTruthy();expect(screen.getByText(i18n.t('p4.refill'))).toBeTruthy();
});

test.each(['denied','error'])('Today %s failure and Health recovery remain explicit',async status=>{
 health.status=status;const view=await page(<TodayScreen/>);expect(screen.getByText(i18n.t(`p3.${status}`))).toBeTruthy();
 await press(i18n.t('settings.health'));await view.unmountAsync();await page(<HealthScreen/>);
 expect((refreshNotifications as jest.Mock).mock.calls.every(([request])=>request!==true)).toBe(true);await press(i18n.t('p3.enable'));expect(refreshNotifications).toHaveBeenCalledWith(true);
 await press(i18n.t('health.notifications'));expect(openNotificationSettings).toHaveBeenCalledTimes(1);
 await press(i18n.t('health.alarms'));expect(openAlarmSettings).toHaveBeenCalledTimes(1);
 await press(i18n.t('health.battery'));expect(openBatterySettings).toHaveBeenCalledTimes(1);
});

test.each(['en','hi','ta','ml','kn','te'] as const)('%s redesigned screens retain warm glass, scalable wrapping and opaque High Contrast',async language=>{
 await i18n.changeLanguage(language);usePreferences.setState({textSize:'extraLarge',language});
 let view=await page(<TalkScreen/>);expect(screen.getByLabelText(i18n.t('talk.input'))).toBeTruthy();expect(screen.getByRole('button',{name:i18n.t('p5.tap')})).toBeEnabled();
 const input=StyleSheet.flatten(screen.getByLabelText(i18n.t('talk.input')).props.style);expect(input.backgroundColor).toBe(stitchColors.glass);
 expect(screen.getByText(i18n.t('p43.createReminder')).props.numberOfLines).toBeUndefined();await view.unmountAsync();
 view=await page(<SettingsScreen/>);expect(screen.getByRole('button',{name:new RegExp(i18n.t('settings.language'))})).toBeTruthy();await view.unmountAsync();
 view=await page(<TalkScreen/>,'hc');expect(screen.UNSAFE_queryByType(RadialGradient)).toBeNull();expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();
 expect(StyleSheet.flatten(screen.getByLabelText(i18n.t('talk.input')).props.style).backgroundColor).toBe(colors.hc.surface1);
});

test.each(['dark','hc'] as const)('%s floating navigation keeps exactly the three routes and accessible scalable labels',async theme=>{
 const layout=fs.readFileSync(path.join(__dirname,'../app/(tabs)/_layout.tsx'),'utf8');
 expect([...layout.matchAll(/<TabTrigger name="([^"]+)"/g)].map(match=>match[1])).toEqual(['today','talk','medicines']);
 await i18n.changeLanguage('ml');usePreferences.setState({textSize:'extraLarge'});
 await page(<BottomTabBar>{(['today','talk','medicines'] as const).map(name=><TabButton key={name} label={i18n.t(`tab.${name}`)} icon={PillIcon} isFocused={name==='talk'}/>)}</BottomTabBar>,theme);
 const tabs=screen.getAllByRole('tab');expect(tabs).toHaveLength(3);
 expect(screen.getByRole('tab',{name:i18n.t('tab.talk')})).toBeSelected();
 const footer=StyleSheet.flatten(screen.getByTestId('navigation-footer').props.style);expect(footer.position).not.toBe('absolute');expect(footer.paddingBottom).toBe(24);
 for(const tab of tabs){const style=StyleSheet.flatten(tab.props.style);expect(style.minHeight).toBeGreaterThanOrEqual(48);expect(style.height).toBeUndefined();}
 for(const name of ['today','talk','medicines']){const text=screen.getByText(i18n.t(`tab.${name}`));expect(text.props.allowFontScaling).toBe(true);expect(text.props.numberOfLines).toBeUndefined();}
});


test('Advanced refuses an ordinary URL change when it would abandon an existing identity',async()=>{
 (assertAddressAllowed as jest.Mock).mockRejectedValueOnce(new ApiError('cutover'));
 await page(<AdvancedScreen/>);const before=usePreferences.getState().serverAddress;
 await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.t('settings.server')),'https://unapproved.example'));
 await press(i18n.t('action.save'));
 expect(usePreferences.getState().serverAddress).toBe(before);
 expect(screen.getByText(i18n.t('api.cutover'))).toBeTruthy();
 expect(screen.queryByText(i18n.t('p14.activate'))).toBeNull();
});
