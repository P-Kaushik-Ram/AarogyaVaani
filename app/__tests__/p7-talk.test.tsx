import React from 'react';
import { AccessibilityInfo,Keyboard,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,useWindowDimensions,View } from 'react-native';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { VoiceDriver,VoiceEvents } from '../src/features/voice/session';
let mockDriver:VoiceDriver,mockEvents:VoiceEvents;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:jest.fn()}));
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useLocalSearchParams:()=>({}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/features/voice/native',()=>({voiceSession:new (require('../src/features/voice/session').VoiceSession)(()=>mockDriver)}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({saveConfirmed:jest.fn(),useNotificationHealth:()=>({status:'unknown'})}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { TalkScreen } from '../src/features/chat/TalkScreen';
import { usePreferences } from '../src/store/preferences';
import { voiceSession } from '../src/features/voice/native';
import { getApi } from '../src/services/api/session';
import { saveConfirmed } from '../src/features/notifications/service';
import { Analysis } from '../src/services/api/models';
import { ApiError } from '../src/services/api/client';
import { router } from 'expo-router';
import { getLanguage } from '../config/languages';

const valid:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:'Calcium',times:['08:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'Confirm details',language:'en'}};
const suggestions=['Calcium at 8 AM daily','Vitamin C at 9 PM daily','Paracetamol at 10 AM daily'];
let api:{languages:jest.Mock;analyze:jest.Mock;create:jest.Mock;list:jest.Mock};
beforeEach(async()=>{
 jest.replaceProperty(Platform,'OS','android');
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 (useWindowDimensions as jest.Mock).mockReturnValue({width:360,height:640,scale:1,fontScale:1});
 mockDriver={available:jest.fn(()=>true),locales:jest.fn(async()=>['en-IN','hi-IN','ta-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),subscribe:jest.fn(events=>{mockEvents=events;return jest.fn();}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 voiceSession.reset({});await i18n.changeLanguage('en');usePreferences.setState({language:'en',textSize:'standard',theme:'dark',storageError:false,serverAddress:'https://fixture.example'});
 api={languages:jest.fn(async()=>[{code:'en'},{code:'hi'},{code:'ta'}]),analyze:jest.fn(async()=>valid),create:jest.fn(),list:jest.fn()};
 (getApi as jest.Mock).mockReturnValue(api);
 (saveConfirmed as jest.Mock).mockReset().mockResolvedValue({medicine:'Calcium',times:['08:00'],days_of_week:'daily'});
});
afterEach(()=>jest.restoreAllMocks());
function page(){const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return renderAsync(<QueryClientProvider client={cache}><I18nextProvider i18n={i18n}><ThemeProvider><TalkScreen/></ThemeProvider></I18nextProvider></QueryClientProvider>);}
async function pressName(name:string){await act(async()=>fireEvent.press(screen.getByRole('button',{name})));}
async function typeReminder(value:string){await act(async()=>fireEvent.changeText(input(),value));}
async function press(key:string){await pressName(i18n.t(key));}
function input(){return screen.getByLabelText(i18n.t('talk.input'));}
function noRequests(){expect(getApi).not.toHaveBeenCalled();expect(api.languages).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();expect(api.create).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();}

test('compact welcome, mic label and renamed input render before any native permission or backend request',async()=>{
 await page();
 expect(screen.getByRole('header',{name:'Just say it!'})).toBeTruthy();
 expect(screen.getByText('Your medicine reminders, made simple.')).toBeTruthy();
 expect(screen.getByText('Speak naturally or type your reminder below.')).toBeTruthy();
 expect(screen.getByText('Tap to speak')).toBeTruthy();expect(input().props.placeholder).toBe('e.g. Metformin at 8 PM daily');
 expect(input().props.multiline).toBe(true);expect(input().props.maxLength).toBe(300);
 expect(screen.getByRole('button',{name:i18n.t('talk.send')})).toBeDisabled();
 expect(mockDriver.permission).not.toHaveBeenCalled();noRequests();
});

test.each(suggestions)('%s can be typed without checking, saving or starting voice',async suggestion=>{
 await page();await typeReminder(suggestion);
 expect(input().props.value).toBe(suggestion);expect(input().props.editable).toBe(true);
 expect(screen.getByRole('button',{name:i18n.t('talk.send')})).toBeEnabled();
 expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(mockDriver.start).not.toHaveBeenCalled();noRequests();
});

test('typed input preserves Check, review, Change, recheck and explicit single Save',async()=>{
 await page();await typeReminder(suggestions[0]);await press('talk.send');
 expect(api.analyze).toHaveBeenCalledWith(suggestions[0],'en');
 expect(within(screen.getByTestId('confirmation-card')).getByText('Calcium')).toBeTruthy();
 expect(saveConfirmed).not.toHaveBeenCalled();await press('action.change');expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(input().props.value).toBe(suggestions[0]);
 await press('talk.send');expect(saveConfirmed).not.toHaveBeenCalled();
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await act(async()=>{fireEvent.press(save);fireEvent.press(save);});
 expect(saveConfirmed).toHaveBeenCalledTimes(1);expect(saveConfirmed).toHaveBeenCalledWith('https://fixture.example',valid);
 expect(screen.getByText(i18n.t('reminder.saved'))).toBeTruthy();
});

test.each(['confirmation','clarification','error','saved'])('input edit clears stale %s without another request',async state=>{
 if(state==='clarification')api.analyze.mockResolvedValue({...valid,draft:{...valid.draft,times:[]},missing:['time_ambiguous'],candidates:{times:['08:00','20:00']}});
 if(state==='error')api.analyze.mockRejectedValue(new ApiError('network'));
 await page();await typeReminder(suggestions[0]);await press('talk.send');
 if(state==='saved')await press('action.save');
 if(state==='error')expect(screen.getByText(i18n.t('api.network'))).toBeTruthy();
 if(state==='clarification')expect(screen.getByRole('button',{name:'20:00'})).toBeTruthy();
 const checks=api.analyze.mock.calls.length,saves=(saveConfirmed as jest.Mock).mock.calls.length;
 await typeReminder(suggestions[1]);expect(input().props.value).toBe(suggestions[1]);
 expect(screen.queryByTestId('confirmation-card')).toBeNull();expect(screen.queryByRole('button',{name:'20:00'})).toBeNull();
 expect(screen.queryByText(i18n.t('api.network'))).toBeNull();expect(screen.queryByText(i18n.t('reminder.saved'))).toBeNull();
 expect(api.analyze).toHaveBeenCalledTimes(checks);expect(saveConfirmed).toHaveBeenCalledTimes(saves);
});

test('Check locks input and preserves checked text',async()=>{
 let resolve!:(value:Analysis)=>void;api.analyze.mockImplementation(()=>new Promise<Analysis>(done=>{resolve=done;}));
 await page();await typeReminder(suggestions[0]);await press('talk.send');
 expect(input().props.editable).toBe(false);expect(input().props.value).toBe(suggestions[0]);
 await act(async()=>resolve(valid));expect(api.analyze).toHaveBeenCalledWith(suggestions[0],'en');expect(saveConfirmed).not.toHaveBeenCalled();
});

test('listening and processing lock input; transcript still requires Check',async()=>{
 await page();await typeReminder(suggestions[0]);await press('p5.tap');await act(async()=>mockEvents.start());
 expect(input().props.editable).toBe(false);expect(screen.getByText(i18n.t('p5.listening'))).toBeTruthy();
 await press('p5.stop');expect(screen.getByText(i18n.t('p5.processing'))).toBeTruthy();
 expect(screen.getByRole('button',{name:i18n.t('p5.cancel')})).toBeEnabled();
 await act(async()=>{mockEvents.result({isFinal:true,results:[{transcript:'My spoken reminder'}]});mockEvents.end();});
 expect(input().props.value).toBe('My spoken reminder');expect(input().props.editable).toBe(true);noRequests();
});

test('microphone permission checking prevents input edits and retains recovery',async()=>{
 let allow!:(value:{granted:boolean;canAskAgain:boolean})=>void;
 (mockDriver.permission as jest.Mock).mockImplementation(()=>new Promise(done=>{allow=done;}));
 await page();await typeReminder(suggestions[0]);await press('p5.tap');expect(input().props.editable).toBe(false);
 await act(async()=>allow({granted:false,canAskAgain:false}));
 expect(screen.getByText(i18n.t('p5.permission'))).toBeTruthy();expect(screen.getByRole('button',{name:i18n.t('p5.settings')})).toBeEnabled();
 expect(input().props.editable).toBe(true);noRequests();
});

test('Try saying and every suggestion are removed',async()=>{
 await page();expect(screen.queryByText('Try saying')).toBeNull();
 for(const name of suggestions)expect(screen.queryByRole('button',{name})).toBeNull();
});

test('full unchanged privacy disclosure is accessible before voice via a named expanded-state button',async()=>{
 await page();expect(screen.getByText(i18n.t('p7.privacySummary'))).toBeTruthy();
 const info=()=>screen.getByRole('button',{name:'How voice works'});
 expect(info().props.accessibilityState.expanded).toBe(false);expect(StyleSheet.flatten(info().props.style).minHeight).toBeGreaterThanOrEqual(48);
 expect(screen.queryByText(i18n.t('p5.privacy'))).toBeNull();await press('p7.voiceInfo');
 expect(info().props.accessibilityState.expanded).toBe(true);
 expect(screen.getByText('Android’s speech service handles audio and may send it to its provider. AarogyaVaani saves no audio recordings. Only text you choose to check is sent to the reminder server.')).toBeTruthy();
 expect(mockDriver.permission).not.toHaveBeenCalled();noRequests();
 await press('p7.voiceInfo');expect(info().props.accessibilityState.expanded).toBe(false);
});

test.each(['en','hi','ta','ml','kn','te'] as const)('%s language indicator opens the existing real setting and retains support limits',async language=>{
 usePreferences.setState({language});await i18n.changeLanguage(language);await page();
 await pressName(i18n.t('p7.voiceLanguage',{language:getLanguage(language).nativeName}));expect(router.push).toHaveBeenCalledWith('/settings/language-voice');
 const mic=screen.getByRole('button',{name:i18n.t('p5.tap')});expect(mic).toBeEnabled();
 expect(input().props.editable).toBe(true);expect(mockDriver.permission).not.toHaveBeenCalled();noRequests();
});

test.each([320,360,412])('%s dp retains wrapping, scalable text, minimum targets and keyboard-aware scroll contracts',async width=>{
 (useWindowDimensions as jest.Mock).mockReturnValue({width,height:568,scale:1,fontScale:2});usePreferences.setState({textSize:'extraLarge',theme:'hc'});await page();await press('p7.voiceInfo');
 const scroll=screen.UNSAFE_getByType(ScrollView);expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');expect(scroll.props.keyboardDismissMode).toBe('on-drag');
 expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
 expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(16);
 const title=screen.getByText('Just say it!');expect(title.props.allowFontScaling).toBe(true);expect(title.props.numberOfLines).toBeUndefined();expect(StyleSheet.flatten(title.props.style).height).toBeUndefined();
 expect(within(scroll).getByLabelText('Or type a reminder')).toBeTruthy();expect(within(scroll).getByRole('button',{name:i18n.t('talk.send')})).toBeTruthy();
});

test('keyboard-visible Check stays outside scroll content, remains single and still requires explicit Save',async()=>{
 const handlers:Record<string,(event:any)=>void>={};jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
 jest.spyOn(Keyboard,'addListener').mockImplementation((event,fn)=>{handlers[event]=fn;return {remove:jest.fn()} as any;});
 await page();await typeReminder('Calcium at 8 AM daily');
 await act(async()=>handlers.keyboardDidShow({}));
 expect(within(screen.getByTestId('keyboard-check-action')).getByRole('button',{name:i18n.t('talk.send')})).toBeEnabled();
 expect(within(screen.UNSAFE_getByType(ScrollView)).queryByRole('button',{name:i18n.t('talk.send')})).toBeNull();
 await press('talk.send');expect(api.analyze).toHaveBeenCalledTimes(1);expect(saveConfirmed).not.toHaveBeenCalled();
 await act(async()=>handlers.keyboardDidHide({}));expect(screen.queryByTestId('keyboard-check-action')).toBeNull();expect(screen.getAllByRole('button',{name:i18n.t('talk.send')})).toHaveLength(1);
});
