import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { View,StyleSheet,useWindowDimensions } from 'react-native';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),back:jest.fn(),replace:jest.fn(),canGoBack:()=>true},useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
let mockNet={isConnected:true,isInternetReachable:true};
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>mockNet}));
jest.mock('../src/services/storage/preferences',()=>({writePreferences:jest.fn()}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:()=>({hasPendingCreate:async()=>false}),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'scheduled',count:30,until:Date.now()+86400000,offline:false})}));
let mockQuery:any;
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:()=>mockQuery}));
jest.mock('../src/features/tracking/useTracking',()=>({useTracking:()=>({doses:[],ready:true,error:false,busy:false,change:jest.fn(),retry:jest.fn()})}));
import { router } from 'expo-router';
import i18n from '../src/i18n';
import { ThemeProvider,StitchFoundation,useTheme } from '../src/design/ThemeProvider';
import { colors,ThemeName,TextSize } from '../src/design';
import { createStyles } from '../src/design/layout';
import { stitchColors } from '../src/design/stitch';
import { BrandHeader,StartupBrand } from '../src/components/brand/BrandIdentity';
import { Screen } from '../src/components/ui/Screen';
import { ConnectionStatus } from '../src/components/ui/ConnectionStatus';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { CalendarCheckIcon } from 'phosphor-react-native/src/icons/CalendarCheck';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { recurrence } from '../src/features/reminders/data';
import { ApiError } from '../src/services/api/client';
import { usePreferences } from '../src/store/preferences';
const reminder={id:7,medicine:'Fixture medicine',times:['08:00'],days_of_week:'daily' as const,timezone:'Asia/Kolkata',status:'active'};
beforeEach(async()=>{
 jest.clearAllMocks();mockNet={isConnected:true,isInternetReachable:true};await i18n.changeLanguage('en');
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-19T00:00:00Z'));
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:320,height:640,scale:2,fontScale:1});
 usePreferences.setState({language:'en',theme:'dark',textSize:'standard',reduceMotion:true,storageError:false});
 mockQuery={data:[reminder],dataUpdatedAt:1,isSuccess:true,isPending:false,isFetching:false,isCached:false,error:null,refetch:jest.fn()};
});
afterEach(()=>jest.restoreAllMocks());
function page(children:React.ReactNode,theme:ThemeName='dark',textSize:TextSize='standard'){
 return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider theme={theme} textSize={textSize}>{children}</ThemeProvider></I18nextProvider>);
}
function insideHeader(node:any){for(let current=node;current;current=current.parent)if(current.props.testID==='brand-header')return true;return false;}

describe.each(['en','hi','ta','ml','kn','te'])('%s compact navigation',language=>{
 test.each(['dark','hc'] as const)('%s extra-large text stays native, untruncated and separate from 48 dp controls',async theme=>{
  (useWindowDimensions as jest.Mock).mockReturnValue({width:320,height:640,scale:2,fontScale:2});await i18n.changeLanguage(language);
  await page(<Screen titleKey="tab.today" back={false} settings>{null}</Screen>,theme,'extraLarge');
  const header=screen.getByTestId('brand-header'),text=within(header).getByText(i18n.t('app.name'));
  expect(screen.getAllByText(i18n.t('app.name'))).toHaveLength(1);expect(within(header).getByText(i18n.t('p4.companion'))).toBeTruthy();
  expect(text.props.allowFontScaling).toBe(true);expect(text.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(header.props.style)).toMatchObject({flexDirection:'row',minHeight:72});
  expect(StyleSheet.flatten(header.props.style)).not.toHaveProperty('height');
  expect(screen.queryByTestId('official-logo')).toBeNull();
  const gear=screen.getByRole('button',{name:i18n.t('settings.title')});expect(insideHeader(gear)).toBe(true);
  expect(StyleSheet.flatten(gear.props.style)).toMatchObject({minWidth:48,minHeight:48,flexShrink:0});
  await act(async()=>fireEvent.press(gear));expect(router.push).toHaveBeenCalledWith('/settings');
 });
});

test.each(['dark','hc'] as const)('%s nested foundations and bottom navigation use one palette',async theme=>{
 function Probe({id}:{id:string}){const current=useTheme();expect(current.colors).toBe(colors[theme]);return <View testID={id} style={createStyles(current.colors).fill}/>;}
 await page(<><Probe id="outer"/><StitchFoundation><Probe id="inner"/><BottomTabBar/></StitchFoundation></>,theme);
 expect(stitchColors).toBe(colors.dark);
 for(const id of ['outer','inner','navigation-footer'])expect(StyleSheet.flatten(screen.getByTestId(id).props.style).backgroundColor).toBe(colors[theme].bg);
});

test('status text stays readable on the brightest elevated brand surface',()=>{
 const luminance=(rgb:number[])=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const hex=(value:string)=>value.slice(1).match(/../g)!.map(v=>parseInt(v,16));
 for(const palette of [colors.dark,colors.hc]){
  const elevated=palette.glassElevated.startsWith('#')?hex(palette.glassElevated):palette.glassElevated.match(/[\d.]+/g)!.slice(0,3).map(Number);
  for(const ink of ['success','danger','accent'] as const){const a=luminance(hex(palette[ink])),b=luminance(elevated);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);}
 }
});

test('cached outage uses one compact block with truthful details and working retry, after the next medicine',async()=>{
 mockNet={isConnected:false,isInternetReachable:false};mockQuery={...mockQuery,isSuccess:false,isCached:true,error:new ApiError('network')};
 const rendered=await page(<View style={{flex:1}}><TodayScreen/><BottomTabBar><TabButton label={i18n.t('tab.today')} icon={CalendarCheckIcon} isFocused/><TabButton label={i18n.t('tab.talk')} icon={ChatCircleIcon}/><TabButton label={i18n.t('tab.medicines')} icon={PillIcon}/></BottomTabBar></View>);
 // Optional local browser QA consumes the real rendered fixture tree. It does
 // not run the app, use a backend/device, or replace Android layout verification.
 if(process.env.AAROGYAVAANI_UI_PREVIEW==='1'){
  const directory=path.join(__dirname,'../dist/p14-2-1-preview');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'today.json'),JSON.stringify(rendered.toJSON(),null,2));
 }
 expect(screen.getAllByTestId('connection-status')).toHaveLength(1);
 const status=within(screen.getByTestId('connection-status'));
 expect(status.getByRole('alert')).toHaveTextContent(i18n.t('connection.unavailable'));expect(status.getByText(i18n.t('p43.cached'))).toBeTruthy();
 await act(async()=>fireEvent.press(status.getByRole('button',{name:i18n.t('connection.showDetails')})));
 expect(status.getByText(i18n.t('api.network'))).toBeTruthy();expect(status.getByText(i18n.t('p2.offline'))).toBeTruthy();
 await act(async()=>fireEvent.press(status.getByRole('button',{name:i18n.t('action.retry')})));expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
 const scroll=screen.getByTestId('screen-scroll');
 function ids(node:any):string[]{return [node.props.testID,...node.children.filter((v:any)=>typeof v!=='string').flatMap(ids)].filter(Boolean);}
 const order=ids(scroll);expect(order.indexOf('today-summary')).toBeLessThan(order.indexOf('next-medicine'));expect(order.indexOf('next-medicine')).toBeLessThan(order.indexOf('connection-status'));expect(order.indexOf('connection-status')).toBeLessThan(order.indexOf('today-medicine-card-7'));
 const recurrenceLabel=within(screen.getByTestId('next-medicine')).getByText(recurrence(reminder.days_of_week,i18n.t.bind(i18n)));
 // An intrinsically sized metadata row must not collapse a zero-basis flex label.
 expect(StyleSheet.flatten(recurrenceLabel.props.style).flex).toBeUndefined();
 expect(screen.getAllByText(reminder.medicine)).toHaveLength(2);
});

test.each(['auth','timeout','server','storage','config'] as const)('%s connection errors remain specific and accessible without cached data',async kind=>{
 const retry=jest.fn();await page(<ConnectionStatus error={new ApiError(kind)} onRetry={retry}/>);
 if(kind==='timeout'||kind==='server'){
  expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('connection.unavailable'));
  await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
  expect(screen.getByText(i18n.t(`api.${kind}`))).toBeTruthy();
 }else expect(screen.getByRole('alert')).toHaveTextContent(i18n.t(`api.${kind}`));
 expect(screen.queryByText(i18n.t('p43.cached'))).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.retry')})));expect(retry).toHaveBeenCalledTimes(1);
});

test('healthy status creates no empty container; loading and cached labels are honest',async()=>{
 const retry=jest.fn();const view=await page(<ConnectionStatus onRetry={retry}/>);expect(screen.queryByTestId('connection-status')).toBeNull();await view.unmountAsync();
 await page(<ConnectionStatus onRetry={retry} loading cached/>);expect(screen.getByText(i18n.t('loading.label'))).toBeTruthy();expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();
});

test('compact header and startup render-tree snapshots retain the new identity',async()=>{
 const header=await page(<BrandHeader/>);expect(header.toJSON()).toMatchSnapshot('compact native header');await header.unmountAsync();
 const startup=await page(<StartupBrand/>);expect(startup.toJSON()).toMatchSnapshot('official startup identity');
 expect(screen.getByTestId('brand-symbol').props.source).toEqual(require('../assets/branding/aarogyavaani_app_icon.png'));
 expect(StyleSheet.flatten(screen.getByTestId('brand-symbol').props.style)).toEqual({width:88,height:88});
});
