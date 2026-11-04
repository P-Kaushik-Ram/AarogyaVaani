import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { renderAsync,screen,fireEvent,waitFor,act,within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { Stop,LinearGradient } from 'react-native-svg';
const extractGradient=require('react-native-svg/src/lib/extract/extractGradient').default;
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useLocalSearchParams:()=>({}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:jest.fn(),saveConfirmed:jest.fn(),cancelConfirmed:jest.fn()}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:jest.fn()}));
import i18n from '../src/i18n';
import { router } from 'expo-router';
import { ThemeProvider,StitchFoundation } from '../src/design/ThemeProvider';
import { colors } from '../src/design';
import { stitchColors } from '../src/design/stitch';
import { TodayScreen } from '../src/features/reminders/TodayScreen';
import { useReminders } from '../src/features/reminders/data';
import { useNotificationHealth,saveConfirmed,cancelConfirmed } from '../src/features/notifications/service';
import { getApi } from '../src/services/api/session';
import { AppText } from '../src/components/ui/Text';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { Reminder } from '../src/services/api/models';
import { ApiError } from '../src/services/api/client';

const reminder:Reminder={id:7,user_id:'fixture',medicine:'Saved medicine',times:['10:00','19:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active',language:'en',note:null,updated_at:'2026-10-17T00:00:00Z'};
let query:any,health:any,api:any;
beforeEach(async()=>{
 jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-17T00:00:00Z'));
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 await i18n.changeLanguage('en');
 query={data:[reminder],dataUpdatedAt:1,isSuccess:true,isPending:false,isFetching:false,error:null,refetch:jest.fn()};
 health={status:'scheduled',count:60,until:Date.now()+30*86400000,offline:false};
 api={hasPendingCreate:jest.fn().mockResolvedValue(false),acknowledgeCreate:jest.fn().mockResolvedValue(undefined)};
 (getApi as jest.Mock).mockReturnValue(api);(useReminders as jest.Mock).mockImplementation(()=>query);(useNotificationHealth as unknown as jest.Mock).mockImplementation(()=>health);
});
afterEach(()=>jest.restoreAllMocks());
async function page(children:React.ReactNode=<TodayScreen/>,theme:'dark'|'hc'='dark',textSize:'standard'|'extraLarge'='standard'){
 return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider theme={theme} textSize={textSize}>{children}</ThemeProvider></I18nextProvider>);
}

test('Today renders saved data only, with no fabricated dosage, and opens existing detail/Talk/Settings flows',async()=>{
 await page();await waitFor(()=>expect(api.hasPendingCreate).toHaveBeenCalled());
 expect(screen.getAllByText(reminder.medicine)).toHaveLength(2);
 const card=within(screen.getByTestId('today-reminder-7'));
 expect(within(screen.getByTestId('today-medicine-card-7')).getByText('10:00')).toBeTruthy();expect(within(screen.getByTestId('today-medicine-card-7')).getByText('19:00')).toBeTruthy();
 expect(screen.queryByText(/500\s?mg|Calcium|Paracetamol/i)).toBeNull();
 await act(async()=>fireEvent.press(screen.getByTestId('today-reminder-7')));
 expect(router.push).toHaveBeenCalledWith({pathname:'/reminder/[id]',params:{id:7}});
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('p4.addReminder')})));
 expect(router.push).toHaveBeenCalledWith('/talk');
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.title')})));
 expect(router.push).toHaveBeenCalledWith('/settings');
 expect(saveConfirmed).not.toHaveBeenCalled();expect(cancelConfirmed).not.toHaveBeenCalled();
});

test('next reminder may be on a later weekday; today excludes paused and non-today reminders',async()=>{
 query.data=[{...reminder,id:8,status:'paused',medicine:'Paused medicine'},{...reminder,days_of_week:[1],medicine:'Monday medicine'}];
 await page();expect(screen.getByText('Monday medicine')).toBeTruthy();
 expect(screen.getByText(i18n.t('p2.day1'))).toBeTruthy();
 expect(screen.queryByText('Paused medicine')).toBeNull();expect(screen.queryByTestId('today-reminder-7')).toBeNull();
 expect(screen.getByText(i18n.t('p2.todayEmpty'))).toBeTruthy();
});

test('no saved reminders shows compact empty next and today states without fixture medicines',async()=>{
 query.data=[];await page();expect(screen.getByTestId('next-medicine-empty')).toBeTruthy();
 expect(screen.getByText(i18n.t('p42.noUpcoming'))).toBeTruthy();expect(screen.getByText(i18n.t('p2.todayEmpty'))).toBeTruthy();
 expect(screen.queryByTestId('next-medicine')).toBeNull();
});

test('loading does not flash empty states; a server error retains retry and labels confirmed upcoming data as cached',async()=>{
 query={...query,data:undefined,isSuccess:false,isPending:true,isFetching:true};const view=await page();
 expect(screen.getByText(i18n.t('loading.label'))).toBeTruthy();expect(screen.queryByTestId('next-medicine-empty')).toBeNull();
 await view.unmountAsync();query={...query,data:[reminder],isPending:false,isFetching:false,error:new ApiError('auth')};await page();
 expect(screen.getByText(i18n.t('api.auth'))).toBeTruthy();expect(screen.getByTestId('next-medicine')).toBeTruthy();expect(screen.getByText(i18n.t('p43.cached'))).toBeTruthy();
 expect(screen.queryByText(i18n.t('p2.todayEmpty'))).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.retry')})));expect(query.refetch).toHaveBeenCalledTimes(1);
});

test.each(['unknown','denied','error','scheduled'])('%s device status is explicit, preserves recovery and never invents a per-reminder guarantee',async status=>{
 health={...health,status,offline:true};await page();
 expect(screen.getByText(i18n.t(`p4.${status}Label`))).toBeTruthy();
 const concise=i18n.t(status==='scheduled'?'p6.scheduled':status==='denied'?'p6.permissionRequired':'p6.needsAttention');
 expect(screen.getAllByText(concise)).toHaveLength(2);
 expect(screen.queryByText(i18n.t('p43.deviceStatus',{status:i18n.t(`p4.${status}Label`)}))).toBeNull();
 expect(screen.getByText(i18n.t('p42.deviceAlerts'))).toBeTruthy();
 expect(screen.getByTestId('today-reminder-7').props.accessibilityLabel).toContain(concise);
 expect(screen.getByText(i18n.t('p3.offline'))).toBeTruthy();
 if(status==='scheduled')expect(screen.getByText(i18n.t('p4.refill'))).toBeTruthy();
 else expect(screen.queryByText(i18n.t('p4.scheduledLabel'))).toBeNull();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.health')})));
 expect(router.push).toHaveBeenCalledWith('/settings/notification-health');
});

test('uncertain-save recovery remains explicit and acknowledge does not create a reminder',async()=>{
 api.hasPendingCreate.mockResolvedValue(true);await page();
 await waitFor(()=>expect(screen.getByText(i18n.t('api.uncertain'))).toBeTruthy());
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('p2.reviewed')})));
 expect(api.acknowledgeCreate).toHaveBeenCalledTimes(1);expect(saveConfirmed).not.toHaveBeenCalled();
});

test('Today palette is scoped; adjacent screens retain the existing palette, high contrast stays opaque',async()=>{
 const view=await page(<><AppText testID="outside">{i18n.t('tab.talk')}</AppText><StitchFoundation><AppText testID="inside">{i18n.t('tab.today')}</AppText></StitchFoundation></>);
 expect(StyleSheet.flatten(screen.getByTestId('outside').props.style).color).toBe(colors.dark.textPrimary);
 expect(StyleSheet.flatten(screen.getByTestId('inside').props.style).color).toBe(stitchColors.textPrimary);
 await view.unmountAsync();await page(<TodayScreen/>,'hc');
 expect(StyleSheet.flatten(screen.getByTestId('next-medicine').props.style).backgroundColor).toBe(colors.hc.surface1);
 expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();
});

test('warm glass uses dark hex stops with explicit opacity and amber controls retain accessible target sizes',async()=>{
 await page();
 for(const stop of screen.UNSAFE_getAllByType(Stop)){expect(stop.props.stopColor).toMatch(/^#[\da-f]{6}$/i);expect(stop.props.stopOpacity).toBeLessThanOrEqual(.3);}
 for(const name of [i18n.t('settings.title'),i18n.t('p4.addReminder')])expect(StyleSheet.flatten(screen.getByRole('button',{name}).props.style).minHeight).toBeGreaterThanOrEqual(48);
 expect(StyleSheet.flatten(screen.getByTestId('next-medicine').props.style).borderColor).toBe(stitchColors.borderSoft);
});

test('navigation stays in layout flow with safe-area clearance and an amber selected icon',async()=>{
 await page(<BottomTabBar><TabButton label={i18n.t('tab.today')} icon={PillIcon} isFocused/><TabButton label={i18n.t('tab.talk')} icon={PillIcon}/><TabButton label={i18n.t('tab.medicines')} icon={PillIcon}/></BottomTabBar>);
 expect(screen.getAllByRole('tab')).toHaveLength(3);expect(screen.getByRole('tab',{name:i18n.t('tab.today')})).toBeSelected();
 const footer=StyleSheet.flatten(screen.getByTestId('navigation-footer').props.style);
 expect(footer.paddingBottom).toBe(24);expect(footer.position).not.toBe('absolute');expect(footer.backgroundColor).toBe(stitchColors.bg);
 expect(screen.UNSAFE_getAllByType(PillIcon)[0].props.color).toBe(stitchColors.accent);
});

test('extra-large translated reminders switch to full-width cards and keep untruncated scaled text',async()=>{
 await i18n.changeLanguage('ta');query.data=[{...reminder,medicine:'நீண்ட மருந்துப் பெயர் '.repeat(8)}];
 await page(<TodayScreen/>,'dark','extraLarge');
 expect(StyleSheet.flatten(screen.getByTestId('today-reminder-7').props.style).alignSelf).toBe('stretch');
 for(const text of screen.getAllByText(query.data[0].medicine)){
  expect(text.props.numberOfLines).toBeUndefined();expect(text.props.allowFontScaling).toBe(true);expect(text.props.maxFontSizeMultiplier).toBeCloseTo(2/1.5);
 }
});

test('actual warm glass gradient extraction preserves dark surfaces and at least 7:1 readable text contrast',async()=>{
 await page();
 const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(v=>parseInt(v,16));
 const blend=(front:number[],back:number[],alpha:number)=>front.map((v,i)=>v*alpha+back[i]*(1-alpha));
 const luminance=(color:number[])=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 const backdrop=blend(rgb(stitchColors.amber),rgb(stitchColors.bg),.08);
 const rgba=stitchColors.glass.match(/[\d.]+/g)!.map(Number),base=blend(rgba.slice(0,3),backdrop,rgba[3]);
 const contrast=(light:number[],dark:number[])=>(luminance(light)+.05)/(luminance(dark)+.05);
 for(const gradient of screen.UNSAFE_getAllByType(LinearGradient)){
  const native=extractGradient(gradient.props,null);
  for(let i=1;i<native.gradient.length;i+=2){
   const packed=native.gradient[i],lit=blend([(packed>>>16)&255,(packed>>>8)&255,packed&255],base,(packed>>>24)/255);
   expect(Math.max(...lit)).toBeLessThan(64);
   for(const text of [stitchColors.textPrimary,stitchColors.textSecondary,stitchColors.accent])expect(contrast(rgb(text),lit)).toBeGreaterThanOrEqual(7);
  }
 }
 expect(contrast(rgb(stitchColors.accent),rgb(stitchColors.onAccent))).toBeGreaterThanOrEqual(7);
});
