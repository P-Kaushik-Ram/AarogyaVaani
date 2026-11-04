import React from 'react';
import { AccessibilityInfo,Platform,StyleSheet,ScrollView,KeyboardAvoidingView } from 'react-native';
import { renderAsync,screen,fireEvent,act } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { LinearGradient,RadialGradient,Stop } from 'react-native-svg';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
const extractGradient=require('react-native-svg/src/lib/extract/extractGradient').default;
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),canGoBack:()=>true,back:jest.fn()},useLocalSearchParams:()=>({}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:()=>({hasPendingCreate:async()=>false}),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:jest.fn(),saveConfirmed:jest.fn(),cancelConfirmed:jest.fn(),refreshNotifications:jest.fn()}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:jest.fn()}));
import i18n from '../src/i18n';
import { router } from 'expo-router';
import { ThemeProvider,StitchFoundation } from '../src/design/ThemeProvider';
import { colors,metrics } from '../src/design';
import { stitchColors,stitchStyles,stitch,polish } from '../src/design/stitch';
import { createStyles } from '../src/design/layout';
import { GlassCard,GlassLight,GlassEdge } from '../src/components/ui/Glass';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { MedicinesScreen } from '../src/features/reminders/Screens';
import { TalkScreen } from '../src/features/chat/TalkScreen';
import { SettingsScreen,AboutScreen } from '../src/features/settings/Screens';
import { ConfirmCard } from '../src/components/chat/ConfirmCard';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { useReminders } from '../src/features/reminders/data';
import { useNotificationHealth,saveConfirmed,cancelConfirmed } from '../src/features/notifications/service';
import { usePreferences } from '../src/store/preferences';
import { Reminder } from '../src/services/api/models';

const reminder:Reminder={id:7,user_id:'fixture',medicine:'Real saved medicine',times:['10:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',note:null,updated_at:'2026-10-17T00:00:00Z'};
let health:any;
beforeEach(async()=>{
 jest.replaceProperty(Platform,'OS','android');jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-17T00:00:00Z'));await i18n.changeLanguage('en');
 usePreferences.setState({language:'en',textSize:'standard',theme:'dark',storageError:false});
 health={status:'scheduled',count:30,until:Date.now()+30*86400000,offline:false};
 (useNotificationHealth as unknown as jest.Mock).mockImplementation(()=>health);
 (useReminders as jest.Mock).mockReturnValue({data:[reminder],dataUpdatedAt:1,isSuccess:true,isPending:false,isFetching:false,isCached:false,error:null,refetch:jest.fn()});
});
afterEach(()=>jest.restoreAllMocks());
async function page(children:React.ReactNode,theme:'dark'|'hc'='dark',textSize:'standard'|'extraLarge'='standard'){
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 return renderAsync(<QueryClientProvider client={cache}><I18nextProvider i18n={i18n}><ThemeProvider theme={theme} textSize={textSize}><StitchFoundation>{children}</StitchFoundation></ThemeProvider></I18nextProvider></QueryClientProvider>);
}

test('layered background and surface gradients use explicit bounded alpha through the actual native extractor',async()=>{
 await page(<><GlassLight ambient/><GlassCard testID="glass"/></>);
 expect(screen.UNSAFE_getAllByType(LinearGradient)).toHaveLength(2);expect(screen.UNSAFE_getAllByType(RadialGradient)).toHaveLength(1);
 for(const stop of screen.UNSAFE_getAllByType(Stop)){expect(stop.props.stopColor).toMatch(/^#[\da-f]{6}$/i);expect(typeof stop.props.stopOpacity).toBe('number');expect(stop.props.stopOpacity).toBeLessThanOrEqual(.3);}
 for(const gradient of [...screen.UNSAFE_getAllByType(LinearGradient),...screen.UNSAFE_getAllByType(RadialGradient)]){
  const children=React.Children.toArray(gradient.props.children) as React.ReactElement<any>[];
  const native=extractGradient(gradient.props,null);
  children.forEach((child,index)=>expect(native.gradient[index*2+1]>>>24).toBe(Math.round(child.props.stopOpacity*255)));
 }
 const rgba=stitchColors.glass.match(/[\d.]+/g)!.map(Number);expect(rgba.slice(0,3)).toEqual([16,45,62]);expect(rgba[3]).toBeLessThan(.92);
 const edge=screen.UNSAFE_getByType(GlassEdge);expect(edge.props).toBeTruthy();
 expect(polish.edgeOpacity).toBeLessThanOrEqual(.12);
});

test.each(['glass','glassElevated'] as const)('%s retains 7:1 text contrast with native card stops, background depth and edge highlight',async surface=>{
 await page(<GlassCard highlight={surface==='glassElevated'}/>);
 const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(v=>parseInt(v,16));
 const blend=(front:number[],back:number[],alpha:number)=>front.map((v,i)=>v*alpha+back[i]*(1-alpha));
 const luminance=(color:number[])=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 const depth=blend(rgb(stitchColors.surface1),rgb(stitchColors.bg),metrics.glass.topOpacity);
 const ambient=blend(rgb(stitchColors.amber),depth,metrics.glass.ambientOpacity);
 const rgba=stitchColors[surface].match(/[\d.]+/g)!.map(Number),base=blend(rgba.slice(0,3),ambient,rgba[3]);
 const native=extractGradient(screen.UNSAFE_getByType(LinearGradient).props,null);
 for(let i=1;i<native.gradient.length;i+=2){
  const packed=native.gradient[i],lit=blend([(packed>>>16)&255,(packed>>>8)&255,packed&255],base,(packed>>>24)/255);
  // Blue/teal naturally has a higher blue channel than brown; constrain actual
  // luminance instead, retaining the existing 7:1 accessibility checks below.
  expect(luminance(lit)).toBeLessThan(.06);
  for(const backdrop of [lit,blend(rgb(stitchColors.accent),lit,polish.edgeOpacity)])for(const text of [stitchColors.textPrimary,stitchColors.textSecondary])expect((luminance(rgb(text))+.05)/(luminance(backdrop)+.05)).toBeGreaterThanOrEqual(7);
 }
});

test('High Contrast removes all decorative lighting, edge highlights and card shadows',async()=>{
 await page(<GlassCard testID="hc"><GlassLight ambient/></GlassCard>,'hc');
 expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();expect(screen.UNSAFE_queryByType(RadialGradient)).toBeNull();
 const style=StyleSheet.flatten(screen.getByTestId('hc').props.style);expect(style.backgroundColor).toBe(colors.hc.surface1);expect(style.shadowOpacity??0).toBe(0);expect(style.elevation??0).toBe(0);
});

test('shared styles reuse allocations per palette and border width without leaking theme styles',()=>{
 expect(createStyles(stitchColors)).toBe(createStyles(stitchColors));expect(stitchStyles(stitchColors)).toBe(stitchStyles(stitchColors));
 expect(createStyles(stitchColors,3)).not.toBe(createStyles(stitchColors));expect(stitchStyles(colors.hc)).not.toBe(stitchStyles(stitchColors));
 expect(createStyles(colors.hc).fill.backgroundColor).toBe(colors.hc.bg);expect(createStyles(stitchColors).fill.backgroundColor).toBe(stitchColors.bg);
});

test.each([TodayScreen,TalkScreen,MedicinesScreen])('%p retains exactly one small, inline app Settings gear with a usable target',async Component=>{
 await page(<Component/>);expect(screen.UNSAFE_getAllByType(GearSixIcon)).toHaveLength(1);
 expect(screen.UNSAFE_getByType(GearSixIcon).props.size).toBe(20);
 const gear=screen.getByRole('button',{name:i18n.t('settings.title')}),style=StyleSheet.flatten(gear.props.style);
 expect(style.position).not.toBe('absolute');expect(style.minWidth).toBeGreaterThanOrEqual(48);expect(style.minHeight).toBeGreaterThanOrEqual(48);
 await act(async()=>fireEvent.press(gear));expect(router.push).toHaveBeenCalledWith('/settings');expect(saveConfirmed).not.toHaveBeenCalled();expect(cancelConfirmed).not.toHaveBeenCalled();
});

test.each(['scheduled','unknown','denied','error'])('polish retains visible %s notification state and recovery',async status=>{
 health={...health,status,offline:true};await page(<TodayScreen/>);
 expect(screen.getByText(i18n.t(`p4.${status}Label`))).toBeTruthy();expect(screen.getByText(i18n.t('p3.offline'))).toBeTruthy();
 if(status==='scheduled')expect(screen.getByText(i18n.t('p4.refill'))).toBeTruthy();
 if(status==='denied'||status==='error')expect(screen.getByText(i18n.t(`p3.${status}`))).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.health')})));expect(router.push).toHaveBeenCalledWith('/settings/notification-health');
});

test.each(['en','hi','ta','ml','kn','te'])('%s confirmation keeps wrapping Save/Change, amber/glass hierarchy and 48 dp targets',async language=>{
 await i18n.changeLanguage(language);const save=jest.fn(),change=jest.fn();
 await page(<ConfirmCard medicine={reminder.medicine.repeat(5)} schedule="10:00" times="10:00" repeat={i18n.t('medicine.daily')} onSave={save} onChange={change}/>,'dark','extraLarge');
 const card=StyleSheet.flatten(screen.getByTestId('confirmation-card').props.style);expect(card.gap).toBeLessThanOrEqual(4);expect(card.height).toBeUndefined();
 for(const [label,color] of [[i18n.t('action.save'),stitchColors.accent],[i18n.t('action.change'),stitchColors.glassElevated]]){
  const button=screen.getByRole('button',{name:label}),style=StyleSheet.flatten(button.props.style);expect(style.backgroundColor).toBe(color);expect(style.minHeight).toBeGreaterThanOrEqual(48);expect(style.flexShrink).toBe(0);
  expect(screen.getByText(label).props.numberOfLines).toBeUndefined();expect(screen.getByText(label).props.allowFontScaling).toBe(true);
 }
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.change')})));expect(change).toHaveBeenCalledTimes(1);expect(save).not.toHaveBeenCalled();
});

test.each(['dark','hc'] as const)('%s navigation keeps safe flow, three tabs and a restrained accessible active indicator',async theme=>{
 await page(<BottomTabBar>{(['today','talk','medicines'] as const).map(name=><TabButton key={name} icon={PillIcon} label={i18n.t(`tab.${name}`)} isFocused={name==='today'}/>)}</BottomTabBar>,theme,'extraLarge');
 expect(screen.getAllByRole('tab')).toHaveLength(3);expect(screen.getByRole('tab',{name:i18n.t('tab.today')})).toBeSelected();
 const footer=StyleSheet.flatten(screen.getByTestId('navigation-footer').props.style);expect(footer.position).not.toBe('absolute');expect(footer.paddingBottom).toBe(24);
 expect(screen.UNSAFE_getAllByType(PillIcon)[0].props.color).toBe(theme==='hc'?colors.hc.onAccent:stitchColors.accent);
 for(const tab of screen.getAllByRole('tab')){const style=StyleSheet.flatten(tab.props.style);expect(style.minHeight).toBeGreaterThanOrEqual(48);expect(style.height).toBeUndefined();}
});

test('cards, Add and microphone are compact without fixed text heights or fake voice activity',async()=>{
 const today=await page(<TodayScreen/>);
 expect(StyleSheet.flatten(screen.getByTestId('today-reminder-7').props.style).padding).toBeLessThan(12);
 const add=screen.getByRole('button',{name:i18n.t('p4.addReminder')});expect(StyleSheet.flatten(add.props.style).minHeight).toBe(48);expect(stitchStyles(stitchColors).addFace.paddingVertical).toBe(2);
 await today.unmountAsync();await page(<TalkScreen/>);
 const mic=screen.getByRole('button',{name:i18n.t('p5.tap')});expect(mic).toBeEnabled();expect(StyleSheet.flatten(mic.props.style).height).toBeLessThan(120);
 expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
 expect(screen.getByLabelText(i18n.t('talk.input')).props.editable).toBe(true);expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();
});

test('five Settings sections and About version times five remain available after glass polish',async()=>{
 const view=await page(<SettingsScreen/>);
 for(const key of ['health.notifications','settings.language','settings.appearance','p4.accessibility','settings.about'])expect(screen.getByRole('button',{name:new RegExp(i18n.t(key))})).toBeTruthy();
 await view.unmountAsync();await page(<AboutScreen/>);jest.clearAllMocks();
 const version=screen.getByRole('button',{name:i18n.t('settings.version',{version:'1.0.0'})});
 for(let i=0;i<4;i++)await act(async()=>fireEvent.press(version));expect(router.push).not.toHaveBeenCalled();
 await act(async()=>fireEvent.press(version));expect(router.push).toHaveBeenCalledWith('/settings/advanced');
});
