import React from 'react';
import { StyleSheet,useWindowDimensions } from 'react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:()=>true},useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
let mockNet:any;
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>mockNet}));
jest.mock('../src/services/storage/preferences',()=>({writePreferences:jest.fn()}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:()=>({hasPendingCreate:async()=>false}),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'scheduled',count:30,until:Date.now()+86400000,offline:false})}));
let mockQuery:any;
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:()=>mockQuery}));
jest.mock('../src/features/tracking/useTracking',()=>({useTracking:()=>({doses:[],ready:true,error:false,busy:false,change:jest.fn(),retry:jest.fn()})}));
import { router } from 'expo-router';
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { colors,TextSize,ThemeName } from '../src/design';
import { usePreferences } from '../src/store/preferences';
import { ApiError } from '../src/services/api/client';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { MedicinesScreen } from '../src/features/reminders/Screens';
import { HistoryDoseCard } from '../src/features/tracking/TrackingUI';
import { Dose } from '../src/features/tracking/doses';
import { BrandHeader } from '../src/components/brand/BrandIdentity';
import { ConnectionStatus } from '../src/components/ui/ConnectionStatus';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { CalendarCheckIcon } from 'phosphor-react-native/src/icons/CalendarCheck';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
const reminder={id:7,medicine:'Fixture medicine',times:['08:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
beforeEach(async()=>{
 jest.clearAllMocks();await i18n.changeLanguage('en');mockNet={isConnected:false,isInternetReachable:false};
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:320,height:640,scale:2,fontScale:1});
 usePreferences.setState({language:'en',theme:'dark',textSize:'standard',reduceMotion:true,storageError:false});
 mockQuery={data:[reminder],dataUpdatedAt:1,isSuccess:false,isPending:false,isFetching:false,isCached:true,error:new ApiError('network'),refetch:jest.fn()};
});
afterEach(()=>jest.restoreAllMocks());
function page(children:React.ReactNode,size:TextSize='standard',theme:ThemeName='dark'){return renderAsync(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{gcTime:0}}})}><I18nextProvider i18n={i18n}><ThemeProvider textSize={size} theme={theme}>{children}</ThemeProvider></I18nextProvider></QueryClientProvider>);}
const flat=(node:any)=>StyleSheet.flatten(node.props.style);

test.each([TodayScreen,MedicinesScreen])('%p uses one status surface, retains details/retry and exactly one Settings gear',async Component=>{
 await page(<Component/>);expect(screen.getAllByTestId('connection-status')).toHaveLength(1);
 expect(screen.getAllByText(i18n.t('p43.cached'))).toHaveLength(1);expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('connection.unavailable'));
 expect(screen.queryByTestId('connection-details')).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
 expect(screen.getByText(i18n.t('api.network'))).toBeTruthy();expect(screen.getByText(i18n.t('p2.offline'))).toBeTruthy();
 expect(screen.getByRole('button',{name:i18n.t('connection.hideDetails')}).props.accessibilityState.expanded).toBe(true);
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.hideDetails')})));expect(screen.queryByTestId('connection-details')).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.retry')})));expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
 expect(screen.UNSAFE_getAllByType(GearSixIcon)).toHaveLength(1);
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.title')})));expect(router.push).toHaveBeenCalledWith('/settings');
});

test('authentication stays explicit beside offline/cached state and is never collapsed into unavailable',async()=>{
 await page(<ConnectionStatus error={new ApiError('auth')} cached onRetry={()=>{}}/>);
 expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('api.auth'));expect(screen.queryByText(i18n.t('connection.unavailable'))).toBeNull();
 expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();expect(screen.queryByText(/Connected/)).toBeNull();
});

test('separate connection errors deduplicate the headline while keeping every existing diagnostic',async()=>{
 await page(<ConnectionStatus error={new ApiError('network')} secondaryError={new ApiError('timeout')} cached onRetry={()=>{}}/>);
 expect(screen.getAllByText(i18n.t('connection.unavailable'))).toHaveLength(1);
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
 for(const key of ['api.network','api.timeout','p2.offline'])expect(screen.getByText(i18n.t(key))).toBeTruthy();
});

test.each(['en','hi','ta','ml','kn','te'])('%s brand retains its exact name with native orange suffix and muted tagline',async language=>{
 await i18n.changeLanguage(language);expect(i18n.t('brand.nameStart')+i18n.t('brand.nameEnd')).toBe(i18n.t('app.name'));
 await page(<BrandHeader/>,'extraLarge');
 const name=screen.getByRole('header',{name:i18n.t('app.name')});expect(name.props.numberOfLines).toBeUndefined();expect(flat(name).color).toBe(colors.dark.textPrimary);
 const suffix=within(name).getByText(i18n.t('brand.nameEnd'));expect(suffix.type).toBe('Text');expect(flat(suffix).color).toBe(colors.dark.accent);
 expect(flat(screen.getByText(i18n.t('p4.companion'))).color).toBe(colors.dark.textSecondary);
 expect(screen.getByTestId('brand-symbol').props.resizeMode).toBe('contain');
});

test.each(['taken','skipped'] as const)('%s history preserves long name, schedule, zone, recorded timestamp and Undo',async status=>{
 (useWindowDimensions as jest.Mock).mockReturnValue({width:320,height:640,scale:2,fontScale:2});
 const dose:Dose={key:'7:fixture',reminderId:7,medicine:'Long fixture medicine '.repeat(12),date:'2026-10-19',time:'08:00',timezone:'Asia/Kolkata',at:Date.parse('2026-10-19T02:30:00Z'),status,recordedAt:'2026-10-19T02:35:00Z'};
 const original=JSON.stringify(dose),change=jest.fn();await page(<HistoryDoseCard dose={dose} busy={false} onChange={change}/>,'extraLarge');
 const card=screen.getByTestId('history-dose-7:fixture');expect(flat(card)).toMatchObject({width:'100%',paddingVertical:8});expect(flat(card).height).toBeUndefined();
 expect(screen.getByText(dose.medicine).props.numberOfLines).toBeUndefined();expect(screen.getAllByText(dose.time)).toHaveLength(1);
 expect(screen.getByText(`${dose.date} · ${dose.timezone}`)).toBeTruthy();expect(screen.getByText(i18n.t('p8.recorded',{timestamp:new Date(dose.recordedAt!).toLocaleString()}))).toBeTruthy();
 expect(screen.getByTestId('dose-status-7:fixture')).toHaveTextContent(`${status==='taken'?i18n.t('p8.checked')+' ':''}${i18n.t(`p8.${status}`)}`);
 const undo=within(screen.getByTestId('dose-actions-7:fixture')).getByRole('button');expect(flat(undo).minHeight).toBeGreaterThanOrEqual(48);
 await act(async()=>fireEvent.press(undo));expect(change).toHaveBeenCalledWith(dose,'pending');expect(JSON.stringify(dose)).toBe(original);
});

test('busy history keeps Undo visible but disabled',async()=>{
 const dose:Dose={key:'7:busy',reminderId:7,medicine:'Fixture',date:'2026-10-19',time:'08:00',timezone:'Asia/Kolkata',at:1,status:'taken',recordedAt:null},change=jest.fn();
 await page(<HistoryDoseCard dose={dose} busy onChange={change}/>);const undo=within(screen.getByTestId('dose-actions-7:busy')).getByRole('button');expect(undo).toBeDisabled();fireEvent.press(undo);expect(change).not.toHaveBeenCalled();
});

test.each(['dark','hc'] as const)('%s tabs use equal 20 dp icons, bounded labels and safe-area clearance',async theme=>{
 await page(<BottomTabBar><TabButton label={i18n.t('tab.today')} icon={CalendarCheckIcon} isFocused/><TabButton label={i18n.t('tab.talk')} icon={ChatCircleIcon}/><TabButton label={i18n.t('tab.medicines')} icon={PillIcon}/></BottomTabBar>,'extraLarge',theme);
 for(const icon of [CalendarCheckIcon,ChatCircleIcon,PillIcon])expect(screen.UNSAFE_getByType(icon).props.size).toBe(20);
 const tabs=screen.getAllByRole('tab');for(const tab of tabs)expect(flat(tab)).toMatchObject({flex:1,minWidth:0,minHeight:48});
 for(const key of ['tab.today','tab.talk','tab.medicines']){const text=screen.getByText(i18n.t(key));expect(flat(text)).toMatchObject({maxWidth:'100%',textAlign:'center'});expect(text.props.numberOfLines).toBeUndefined();}
 expect(flat(screen.getByText(i18n.t('tab.today'))).color).toBe(colors[theme].accent);expect(flat(screen.getByText(i18n.t('tab.talk'))).color).toBe(colors[theme].textSecondary);
 expect(flat(screen.getByTestId('navigation-footer')).paddingBottom).toBe(24);
});
