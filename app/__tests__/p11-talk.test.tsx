import React from 'react';
import { AccessibilityInfo,AppState,Keyboard,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,useWindowDimensions,View } from 'react-native';
import { act,fireEvent,renderAsync,screen,within } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { VoiceDriver,VoiceEvents } from '../src/features/voice/session';
let mockDriver:VoiceDriver,mockEvents:VoiceEvents,mockBlurs:(()=>void)[],mockLifecycle:Record<string,((value:any)=>void)[]>;
let mockOutput:import('../src/features/voice/feedback').SpeechFeedback,mockEngine:any,mockLoad:jest.Mock;
let mockCues:{play:jest.Mock;cancel:jest.Mock};
jest.mock('../src/features/voice/feedbackNative',()=>({speechFeedback:{respond:(...args:any[])=>mockOutput.respond(...args as [string,string,()=>boolean,(mockProblem:any)=>void]),cancel:()=>mockOutput.cancel(),silence:()=>mockOutput.silence()}}));
import { SpeechFeedback } from '../src/features/voice/feedback';
import { LanguageVoiceScreen } from '../src/features/settings/Screens';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:jest.fn()}));
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('../src/services/storage/preferences',()=>({readPreferences:jest.fn(),writePreferences:jest.fn(async()=>{})}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useLocalSearchParams:()=>({}),useFocusEffect:(callback:()=>()=>void)=>{require('react').useEffect(()=>{const cleanup=callback();mockBlurs.push(cleanup);return cleanup;},[callback]);}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/features/voice/native',()=>({voiceSession:new (require('../src/features/voice/session').VoiceSession)(()=>mockDriver,{play:(kind:string)=>mockCues.play(kind),cancel:()=>mockCues.cancel()})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({saveConfirmed:jest.fn(),useNotificationHealth:()=>({status:'unknown'})}));
import i18n,{resources} from '../src/i18n';
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
 mockBlurs=[];mockLifecycle={};
 mockCues={play:jest.fn(async()=>({safe:true})),cancel:jest.fn()};
 jest.spyOn(AppState,'addEventListener').mockImplementation((event,callback)=>{(mockLifecycle[event]??=[]).push(callback);return {remove:jest.fn()};});
 jest.replaceProperty(Platform,'OS','android');
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 (useWindowDimensions as jest.Mock).mockReturnValue({width:360,height:640,scale:1,fontScale:1});
 mockDriver={available:jest.fn(()=>true),locales:jest.fn(async()=>['en-IN','hi-IN','ta-IN','ml-IN','kn-IN','te-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),subscribe:jest.fn(events=>{mockEvents=events;return jest.fn();}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 mockEngine={getVoices:jest.fn(async()=>['en','hi','ta','ml','kn','te'].map(language=>({identifier:language+'-in-x-local',language:language+'-IN'}))),stop:jest.fn(async()=>{}),speak:jest.fn(async()=>{}),addListener:jest.fn(()=>({remove:jest.fn()}))};mockLoad=jest.fn(()=>mockEngine);mockOutput=new SpeechFeedback(mockLoad);
 voiceSession.reset({});await i18n.changeLanguage('en');usePreferences.setState({voiceResponses:false,language:'en',textSize:'standard',theme:'dark',storageError:false,serverAddress:'https://fixture.example'});
 api={languages:jest.fn(async()=>['en','hi','ta','ml','kn','te'].map(code=>({code}))),analyze:jest.fn(async()=>valid),create:jest.fn(),list:jest.fn()};
 (getApi as jest.Mock).mockReturnValue(api);
 (saveConfirmed as jest.Mock).mockReset().mockResolvedValue({medicine:'Calcium',times:['08:00'],days_of_week:'daily'});
});
afterEach(async()=>{await act(async()=>{mockEvents?.end();await mockOutput.silence();});jest.restoreAllMocks();});
function page(children:React.ReactNode=<TalkScreen/>){const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return renderAsync(<QueryClientProvider client={cache}><I18nextProvider i18n={i18n}><ThemeProvider>{children}</ThemeProvider></I18nextProvider></QueryClientProvider>);}
async function pressName(name:string){await act(async()=>fireEvent.press(screen.getByRole('button',{name})));}
async function typeReminder(value:string){await act(async()=>fireEvent.changeText(input(),value));}
async function press(key:string){await pressName(i18n.t(key));}
function input(){return screen.getByLabelText(i18n.t('talk.input'));}
function noRequests(){expect(getApi).not.toHaveBeenCalled();expect(api.languages).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();expect(api.create).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();}


const spoken=()=>mockEngine.speak.mock.calls.map((call:any[])=>call[1]);
async function checked(){await typeReminder(suggestions[0]);await press('talk.send');}
test('off by default: Check and explicit Save never initialize TTS',async()=>{
 await page();await checked();await press('action.save');expect(mockLoad).not.toHaveBeenCalled();expect(mockEngine.speak).not.toHaveBeenCalled();
});
test.each(['en','hi','ta','ml','kn','te'] as const)('%s speaks resolved backend details in selected language, requires Check and explicit Save',async language=>{
 usePreferences.setState({language,voiceResponses:true});await i18n.changeLanguage(language);await page();
 await press('p5.tap');await act(async()=>mockEvents.start());await act(async()=>{mockEvents.result({isFinal:true,results:[{transcript:'my reminder'}]});mockEvents.end();});
 expect(mockEngine.speak).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
 await press('talk.send');expect(spoken()).toEqual([i18n.t('p11.confirm',{medicine:'Calcium',times:'08:00',repeat:i18n.t('medicine.daily')})]);expect(mockEngine.speak.mock.calls[0][2].language).toBe(language+'-IN');expect(saveConfirmed).not.toHaveBeenCalled();
 await press('action.save');expect(spoken().at(-1)).toBe(i18n.t('p11.saved'));expect(saveConfirmed).toHaveBeenCalledTimes(1);
});
test('uncertain time reads clarification only, never inferred medicine or candidate time',async()=>{
 usePreferences.setState({voiceResponses:true});api.analyze.mockResolvedValue({...valid,missing:['time_ambiguous'],candidates:{times:['08:00','20:00']}});await page();await checked();expect(spoken()).toEqual([i18n.t('p11.missingTime')]);expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(saveConfirmed).not.toHaveBeenCalled();
});
test('save success is spoken only after server promise resolves; repeated taps submit once',async()=>{
 usePreferences.setState({voiceResponses:true});let resolve!:(mockProblem:any)=>void;(saveConfirmed as jest.Mock).mockImplementation(()=>new Promise(done=>{resolve=done;}));await page();await checked();
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await act(async()=>{fireEvent.press(save);fireEvent.press(save);});expect(saveConfirmed).toHaveBeenCalledTimes(1);expect(spoken()).not.toContain(i18n.t('p11.saved'));
 await act(async()=>resolve({medicine:'Calcium',times:['08:00'],days_of_week:'daily'}));expect(spoken().at(-1)).toBe(i18n.t('p11.saved'));
});
test.each(['auth','network'] as const)('%s save error speaks definite failure or uncertainty truthfully, never success',async kind=>{
 usePreferences.setState({voiceResponses:true});(saveConfirmed as jest.Mock).mockRejectedValue(new ApiError(kind));await page();await checked();await press('action.save');expect(spoken().at(-1)).toBe(i18n.t(kind==='auth'?'p11.saveFailed':'p11.saveUncertain'));expect(spoken()).not.toContain(i18n.t('p11.saved'));expect(screen.queryByText(i18n.t('reminder.saved'))).toBeNull();
});
test('backend unavailable speaks short failure and never exposes Save',async()=>{
 usePreferences.setState({voiceResponses:true});api.languages.mockRejectedValue(new ApiError('network'));await page();await checked();expect(spoken()).toEqual([i18n.t('p11.checkFailed')]);expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();
});
test('missing selected TTS language shows fallback and retains visual Save',async()=>{
 usePreferences.setState({voiceResponses:true});mockEngine.getVoices.mockResolvedValue([]);await page();await checked();expect(screen.getByText(i18n.t('p11.language',{language:'English'}))).toBeTruthy();expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeEnabled();expect(mockEngine.speak).not.toHaveBeenCalled();
});
test('rapid microphone taps wait for output stop before capture, then no speech runs during listening',async()=>{
 usePreferences.setState({voiceResponses:true});await page();await checked();const microphone=screen.getByRole('button',{name:i18n.t('p5.tap')});
 await act(async()=>{fireEvent.press(microphone);fireEvent.press(microphone);});expect(mockDriver.start).toHaveBeenCalledTimes(1);expect(mockEngine.stop.mock.invocationCallOrder.some((order:number)=>order>mockEngine.speak.mock.invocationCallOrder[0]&&order<(mockDriver.start as jest.Mock).mock.invocationCallOrder[0])).toBe(true);
 await act(async()=>mockEvents.start());expect(spoken()).toHaveLength(1);expect(screen.queryByTestId('confirmation-card')).toBeNull();await press('p5.cancel');await act(async()=>mockEvents.end());
});

test.each(['en','hi','ta','ml','kn','te'] as const)('%s handoff after TTS never stops output again when recognition becomes busy or rerenders',async language=>{
 (mockDriver.locales as jest.Mock).mockResolvedValue(['ja-JP']);
 usePreferences.setState({voiceResponses:true,language});await i18n.changeLanguage(language);await page();await checked();
 await press('p5.tap');
 const captureOrder=(mockDriver.start as jest.Mock).mock.invocationCallOrder[0];
 expect(mockEngine.stop.mock.invocationCallOrder.every((order:number)=>order<captureOrder)).toBe(true);
 const stops=mockEngine.stop.mock.calls.length;
 await act(async()=>mockEvents.start());
 await act(async()=>mockEvents.result({isFinal:false,results:[{transcript:'private draft'}]}));
 expect(mockEngine.stop).toHaveBeenCalledTimes(stops);expect(mockDriver.abort).not.toHaveBeenCalled();expect(mockDriver.stop).not.toHaveBeenCalled();
 expect(voiceSession.getState().phase).toBe('listening');expect(spoken()).toHaveLength(1);
 await press('p5.cancel');await act(async()=>mockEvents.end());
});

test.each(['before-ready','after-ready','unsupported','provider-abort'] as const)('Tamil %s shows an error, keeps typing and never checks or saves',async kind=>{
 usePreferences.setState({language:'ta'});await i18n.changeLanguage('ta');await page();
 if(kind==='unsupported')(mockDriver.locales as jest.Mock).mockResolvedValue(['en-IN','hi-IN']);
 await press('p5.tap');
 await act(async()=>{
  if(kind==='unsupported')mockEvents.error({error:'language-not-supported',code:12});
  if(kind!=='before-ready')mockEvents.start();
  if(kind==='provider-abort')mockEvents.error({error:'aborted',code:5});
  mockEvents.end();
 });
 expect(screen.getByText(i18n.t(kind==='unsupported'?'p5.locale':kind==='provider-abort'?'p5.error':'p5.noSpeech',{language:getLanguage('ta').nativeName}))).toBeTruthy();
 expect(screen.getByLabelText(i18n.t('talk.input')).props.editable).toBe(true);
 expect(api.analyze).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
});

test('Tamil waits for an asynchronous native TTS stop before capture and makes no second stop',async()=>{
 usePreferences.setState({voiceResponses:true,language:'ta'});await i18n.changeLanguage('ta');await page();await checked();
 let stopped!:()=>void;
 mockEngine.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{stopped=resolve;}));
 await press('p5.tap');expect(mockDriver.start).not.toHaveBeenCalled();
 await act(async()=>stopped());expect(mockDriver.start).toHaveBeenCalledWith('ta-IN');
 const order=(mockDriver.start as jest.Mock).mock.invocationCallOrder[0];
 expect(mockEngine.stop.mock.invocationCallOrder.every((value:number)=>value<order)).toBe(true);
 await act(async()=>{mockEvents.start();mockEvents.result({isFinal:true,results:[{transcript:'editable Tamil input'}]});mockEvents.end();});
 expect(input().props.value).toBe('editable Tamil input');expect(api.analyze).toHaveBeenCalledTimes(1);expect(saveConfirmed).not.toHaveBeenCalled();
});

test.each([false,true])('five consecutive Tamil sessions preserve input and TTS handoff with voice replies=%s',async enabled=>{
 usePreferences.setState({language:'ta',voiceResponses:enabled});await i18n.changeLanguage('ta');await page();
 for(let index=0;index<5;index++){
  if(enabled)await checked();
  await press('p5.tap');expect(mockDriver.start).toHaveBeenLastCalledWith('ta-IN');
  expect(mockCues.play).toHaveBeenLastCalledWith('start');
  const capture=(mockDriver.start as jest.Mock).mock.invocationCallOrder.at(-1)!;
  expect(mockCues.play.mock.invocationCallOrder.at(-1)).toBeLessThan(capture);
  await act(async()=>mockEvents.start());
  await act(async()=>{mockEvents.result({isFinal:true,results:[{transcript:`Tamil session ${index+1}`}]});mockEvents.audioend();mockEvents.end();});
  expect(input().props.value).toBe(`Tamil session ${index+1}`);expect(mockCues.play).toHaveBeenLastCalledWith('stop');
  expect(voiceSession.getState()).toMatchObject({phase:'success',busy:false});
 }
 expect(mockDriver.start).toHaveBeenCalledTimes(5);expect(mockDriver.abort).not.toHaveBeenCalled();
 expect(api.analyze).toHaveBeenCalledTimes(enabled?5:0);expect(saveConfirmed).not.toHaveBeenCalled();
});

test('Tamil immediate second end stays visibly failed after the first success',async()=>{
 usePreferences.setState({language:'ta'});await i18n.changeLanguage('ta');await page();await press('p5.tap');
 await act(async()=>{mockEvents.start();mockEvents.result({isFinal:true,results:[{transcript:'first input'}]});mockEvents.end();});
 await press('p5.tap');await act(async()=>mockEvents.end());
 expect(screen.getByText(i18n.t('p5.noSpeech'))).toBeTruthy();expect(input().props.value).toBe('first input');
 expect(mockCues.play.mock.calls.filter(([kind])=>kind==='stop')).toHaveLength(1);
 expect(saveConfirmed).not.toHaveBeenCalled();
});

test.each(['nativeMissing','error'])('microphone cue %s shows a visible fallback while preserving speech input',async problem=>{
 mockCues.play.mockResolvedValue({safe:true,problem});await page();await press('p5.tap');
 expect(screen.getByText(i18n.t(`p112.cue.${problem}`))).toBeTruthy();
 await act(async()=>{mockEvents.start();mockEvents.result({isFinal:true,results:[{transcript:'editable speech'}]});mockEvents.end();});
 expect(input().props.value).toBe('editable speech');expect(saveConfirmed).not.toHaveBeenCalled();
});

test('interrupted handoff after the first Tamil session is visible; returning focus allows another session',async()=>{
 usePreferences.setState({language:'ta',voiceResponses:true});await i18n.changeLanguage('ta');await page();await checked();await press('p5.tap');
 await act(async()=>{mockEvents.start();mockEvents.result({isFinal:true,results:[{transcript:'first Tamil input'}]});mockEvents.end();});
 await act(async()=>mockLifecycle.blur.forEach(callback=>callback(undefined)));await press('p5.tap');
 expect(mockDriver.start).toHaveBeenCalledTimes(1);expect(screen.getByText(i18n.t('p11.microphoneInterrupted'))).toBeTruthy();
 await act(async()=>mockLifecycle.focus.forEach(callback=>callback(undefined)));await press('p5.tap');expect(mockDriver.start).toHaveBeenCalledTimes(2);
 await act(async()=>mockEvents.end());expect(screen.getByText(i18n.t('p5.noSpeech'))).toBeTruthy();
});
test('disable while voice discovery waits discards stale response; edits and unmount stop output',async()=>{
 usePreferences.setState({voiceResponses:true});let resolve!:(mockProblem:any)=>void;mockEngine.getVoices.mockImplementationOnce(()=>new Promise((done:any)=>{resolve=done;}));const view=await page();await checked();
 await act(async()=>usePreferences.setState({voiceResponses:false}));await act(async()=>resolve([{identifier:'en-in-x-local',language:'en-IN'}]));expect(mockEngine.speak).not.toHaveBeenCalled();
 await act(async()=>usePreferences.setState({voiceResponses:true}));await checked();const stops=mockEngine.stop.mock.calls.length;await typeReminder('changed');expect(mockEngine.stop.mock.calls.length).toBeGreaterThan(stops);await view.unmountAsync();expect(mockEngine.addListener.mock.results.every((result:any)=>result.value.remove.mock.calls.length===1)).toBe(true);
});
test('missing native output module preserves visual confirmation',async()=>{
 usePreferences.setState({voiceResponses:true});mockLoad.mockImplementation(()=>{throw new (require('../src/features/voice/feedback').FeedbackFailure)('nativeMissing');});await page();await checked();expect(screen.getByText(i18n.t('p11.nativeMissing'))).toBeTruthy();expect(screen.getByTestId('confirmation-card')).toBeTruthy();
});

test.each(['background','blur','unmount','language','scope'] as const)('%s cancels queued speech and discards late voice results',async reason=>{
 usePreferences.setState({voiceResponses:true});let resolve!:(value:any)=>void;mockEngine.getVoices.mockImplementationOnce(()=>new Promise((done:any)=>{resolve=done;}));const view=await page();await checked();expect(mockEngine.getVoices).toHaveBeenCalled();
 if(reason==='unmount')await view.unmountAsync();else await act(async()=>{
  if(reason==='background')mockLifecycle.change.forEach(callback=>callback('background'));
  if(reason==='blur')mockBlurs.forEach(callback=>callback());
  if(reason==='language')usePreferences.setState({language:'hi'});
  if(reason==='scope')usePreferences.setState({serverAddress:'https://other.example'});
 });
 await act(async()=>resolve([{identifier:'en-in-x-local',language:'en-IN'}]));expect(mockEngine.speak).not.toHaveBeenCalled();expect(mockEngine.stop).toHaveBeenCalled();
});
test('Voice responses switch is off by default and can be enabled and disabled independently of visual confirmation',async()=>{
 await page(<LanguageVoiceScreen/>);const toggle=()=>screen.getByRole('switch',{name:i18n.t('p11.setting')});expect(toggle().props.accessibilityState.checked).toBe(false);await act(async()=>fireEvent(toggle(),'valueChange',true));expect(usePreferences.getState().voiceResponses).toBe(true);await act(async()=>fireEvent(toggle(),'valueChange',false));expect(usePreferences.getState().voiceResponses).toBe(false);expect(mockLoad).not.toHaveBeenCalled();
});
test('microphone and Check in the same frame cannot overlap while output handoff is pending',async()=>{
 await page();await typeReminder(suggestions[0]);await act(async()=>{fireEvent.press(screen.getByRole('button',{name:i18n.t('p5.tap')}));fireEvent.press(screen.getByRole('button',{name:i18n.t('talk.send')}));});expect(api.analyze).not.toHaveBeenCalled();expect(mockDriver.start).toHaveBeenCalledTimes(1);await act(async()=>mockEvents.end());
});

test('a backend result arriving after background/resume is not spoken as a fresh response',async()=>{
 usePreferences.setState({voiceResponses:true});let resolve!:(value:Analysis)=>void;api.analyze.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await page();await checked();
 await act(async()=>{mockLifecycle.change.forEach(callback=>callback('background'));mockLifecycle.change.forEach(callback=>callback('active'));});
 await act(async()=>resolve(valid));expect(screen.getByTestId('confirmation-card')).toBeTruthy();expect(mockEngine.speak).not.toHaveBeenCalled();
});

test.each(['safety','missingMedicine','missingFrequency'] as const)('%s never reads incomplete or refused details as resolved',async kind=>{
 usePreferences.setState({voiceResponses:true});api.analyze.mockResolvedValue({...valid,safety:{triggered:kind==='safety',reason:null},missing:kind==='safety'?[]:[kind==='missingMedicine'?'medicine':'frequency']});await page();await checked();expect(spoken()).toEqual(kind==='safety'?[]:[i18n.t('p11.clarify')]);expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(saveConfirmed).not.toHaveBeenCalled();
});
test('Android focus loss cancels output, without replay on focus return',async()=>{
 usePreferences.setState({voiceResponses:true});await page();await checked();const count=mockEngine.stop.mock.calls.length;await act(async()=>mockLifecycle.blur.forEach(callback=>callback(undefined)));expect(mockEngine.stop.mock.calls.length).toBeGreaterThan(count);await act(async()=>mockLifecycle.focus.forEach(callback=>callback(undefined)));expect(spoken()).toHaveLength(1);
});


test.each(['en','hi','ta','ml','kn','te'] as const)('%s unavailable TTS keeps translated details and voice-data help without English speech',async language=>{
 usePreferences.setState({voiceResponses:true,language});await i18n.changeLanguage(language);
 mockEngine.getVoices.mockResolvedValue([{identifier:'en-in-x-local',language:'en-IN'}].filter(v=>language!=='en'));
 await page();await checked();expect(screen.getByText(i18n.t('p132.voiceHelp'))).toBeTruthy();expect(screen.getByTestId('confirmation-card')).toBeTruthy();
 expect(mockEngine.speak).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
 await press('p5.tap');expect(mockDriver.start).toHaveBeenCalledWith(language+'-IN');await act(async()=>mockEvents.end());
});

test.each((['en','hi','ta','ml','kn','te'] as const).flatMap(language=>(['check','save','uncertain'] as const).map(kind=>({language,kind}))))('$language $kind failure is displayed/spoken in selected language, not raw server English',async({language,kind})=>{
 usePreferences.setState({voiceResponses:true,language});await i18n.changeLanguage(language);await page();
 if(kind==='check')api.languages.mockRejectedValueOnce(new ApiError('network'));
 await checked();
 if(kind!=='check'){(saveConfirmed as jest.Mock).mockRejectedValueOnce(new ApiError(kind==='save'?'auth':'network'));await press('action.save');}
 const key=kind==='check'?'p11.checkFailed':kind==='save'?'p11.saveFailed':'p11.saveUncertain';
 expect(spoken().at(-1)).toBe(i18n.t(key));expect(screen.getByText(i18n.t(key))).toBeTruthy();
 expect(mockEngine.speak.mock.calls.at(-1)[2].language).toBe(language+'-IN');
 if(language!=='en')expect(spoken().at(-1)).not.toBe(i18n.getFixedT('en')(key));
 expect(spoken()).not.toContain(i18n.t('p11.saved'));
});

test('selected Malayalam response stays Malayalam even before global i18n catches up',async()=>{
 usePreferences.setState({language:'ml',voiceResponses:true});await page();
 await act(async()=>fireEvent.changeText(screen.getByLabelText(i18n.getFixedT('ml')('talk.input')),'remind me "Exact Brand" at 8 PM daily'));
 await pressName(i18n.getFixedT('ml')('talk.send'));
 expect(api.analyze).toHaveBeenCalledWith('remind me "Exact Brand" at 8 PM daily','ml');
 expect(spoken()[0]).toBe(i18n.getFixedT('ml')('p11.confirm',{medicine:'Calcium',times:'08:00',repeat:i18n.getFixedT('ml')('medicine.daily')}));
 expect(mockEngine.speak.mock.calls[0][2].language).toBe('ml-IN');expect(saveConfirmed).not.toHaveBeenCalled();
 expect(within(screen.getByTestId('confirmation-card')).getByRole('button',{name:i18n.getFixedT('ml')('action.save')})).toBeTruthy();
});

test('switching Malayalam to Kannada drops a late backend response instead of speaking it in the new language',async()=>{
 usePreferences.setState({language:'ml',voiceResponses:true});await i18n.changeLanguage('ml');let complete!:(v:Analysis)=>void;
 api.analyze.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));await page();await checked();
 await act(async()=>{usePreferences.setState({language:'kn'});await i18n.changeLanguage('kn');});
 await act(async()=>complete(valid));expect(mockEngine.speak).not.toHaveBeenCalled();expect(screen.queryByTestId('confirmation-card')).toBeNull();
});


test('switching language during active Malayalam TTS stops it; only fresh Kannada response can play',async()=>{
 usePreferences.setState({language:'ml',voiceResponses:true});await i18n.changeLanguage('ml');await page();await checked();
 expect(mockEngine.speak.mock.calls[0][2].language).toBe('ml-IN');const oldDone=mockEngine.addListener.mock.calls.find((call:any[])=>call[0]==='Exponent.speakingDone')[1];const oldId=mockEngine.speak.mock.calls[0][0];
 const stops=mockEngine.stop.mock.calls.length;await act(async()=>{usePreferences.setState({language:'kn'});await i18n.changeLanguage('kn');});expect(mockEngine.stop.mock.calls.length).toBeGreaterThan(stops);
 await checked();expect(mockEngine.speak.mock.calls.at(-1)[2].language).toBe('kn-IN');
 const displayed=spoken().at(-1);await act(async()=>oldDone({id:oldId}));expect(screen.getByText(displayed)).toBeTruthy();expect(mockEngine.speak).toHaveBeenCalledTimes(2);
});


test.each(['en','hi','ta','ml','kn','te'] as const)('P13.3 %s speech equals the displayed response even with English backend reply and stale global language',async language=>{
 usePreferences.setState({language,voiceResponses:true});await page();
 const t=i18n.getFixedT(language);
 await act(async()=>fireEvent.changeText(screen.getByLabelText(t('talk.input')),'PrivateBrand at 8 AM daily'));
 await pressName(t('talk.send'));
 expect(screen.getByTestId('talk-response').props.children).toBe(spoken().at(-1));
 expect(spoken().at(-1)).toBe(t('p11.confirm',{medicine:'Calcium',times:'08:00',repeat:t('medicine.daily')}));
 expect(mockEngine.speak.mock.calls.at(-1)[2]).toEqual({language:language+'-IN',voice:language+'-in-x-local'});
});

test.each(['ml','kn','te'] as const)('P13.3 %s missing matching voice retains localized response without English output',async language=>{
 usePreferences.setState({language,voiceResponses:true});await i18n.changeLanguage(language);
 mockEngine.getVoices.mockResolvedValue([{identifier:'en-in-x-local',language:'en-IN'}]);await page();await checked();
 expect(screen.getByTestId('talk-response').props.children).toBe(i18n.t('p11.confirm',{medicine:'Calcium',times:'08:00',repeat:i18n.t('medicine.daily')}));
 expect(screen.getByText(i18n.t('p132.voiceHelp'))).toBeTruthy();expect(mockEngine.speak).not.toHaveBeenCalled();
});

test('P13.3 diagnostic metadata contains language and requested voice but no response or medicine',async()=>{
 const log=jest.spyOn(console,'debug').mockImplementation(()=>{});
 usePreferences.setState({language:'ml',voiceResponses:true});await page();
 const t=i18n.getFixedT('ml');await act(async()=>fireEvent.changeText(screen.getByLabelText(t('talk.input')),'PrivateBrand at 8 AM daily'));await pressName(t('talk.send'));
 expect(log).toHaveBeenCalledWith('[voice]','tts-response',expect.objectContaining({selectedLanguage:'ml',displayLanguage:'ml',textLanguage:'ml',locale:'ml-IN'}));
 expect(log).toHaveBeenCalledWith('[voice]','tts-voice',expect.objectContaining({voice:'ml-in-x-local',voiceLanguage:'ml-IN'}));
 const serialized=JSON.stringify(log.mock.calls);expect(serialized).not.toContain('Calcium');expect(serialized).not.toContain('PrivateBrand');expect(serialized).not.toContain(spoken().at(-1));
});


test.each(['ml','kn','te'] as const)('P13.3 %s accidental English template is blocked before voice discovery',async language=>{
 const catalog=resources[language].translation,original=catalog['p11.confirm'];
 try{
  catalog['p11.confirm']=resources.en.translation['p11.confirm'];
  usePreferences.setState({language,voiceResponses:true});await i18n.changeLanguage(language);await page();await checked();
  expect(mockEngine.speak).not.toHaveBeenCalled();expect(mockEngine.getVoices).not.toHaveBeenCalled();
  expect(screen.getByTestId('talk-response').props.children).toBe(i18n.t('p11.error'));
  expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeEnabled();
 }finally{catalog['p11.confirm']=original;}
});


test.each(['en','hi','ta','ml','kn','te'] as const)('P13.4 %s shows starting immediately through TTS handoff, then only native start becomes listening',async language=>{
 usePreferences.setState({language,voiceResponses:true});await i18n.changeLanguage(language);await page();await checked();
 let release!:()=>void;mockEngine.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
 const button=screen.getByRole('button',{name:i18n.t('p5.tap')});await act(async()=>{fireEvent.press(button);fireEvent.press(button);});
 expect(screen.getByText(i18n.t('p134.starting'))).toBeTruthy();expect(screen.queryByTestId('microphone-listening-ring')).toBeNull();expect(mockDriver.start).not.toHaveBeenCalled();
 await act(async()=>release());expect(mockDriver.start).toHaveBeenCalledTimes(1);expect(mockDriver.start).toHaveBeenCalledWith(language+'-IN');expect(screen.getByText(i18n.t('p134.starting'))).toBeTruthy();
 await act(async()=>mockEvents.start());expect(screen.getByText(i18n.t('p5.listening'))).toBeTruthy();expect(screen.getByTestId('microphone-listening-ring')).toBeTruthy();
 await press('p5.stop');expect(screen.getByText(i18n.t('p5.processing'))).toBeTruthy();expect(screen.getByTestId('microphone-processing-ring')).toBeTruthy();
 await act(async()=>{mockEvents.error({error:'no-speech'});mockEvents.end();});expect(screen.queryByTestId('microphone-processing-ring')).toBeNull();expect(screen.getByRole('button',{name:i18n.t('p5.tap')})).toBeEnabled();
});
test.each(['cancel','language'] as const)('P13.4 %s during TTS handoff never starts stale capture',async reason=>{
 usePreferences.setState({voiceResponses:true});await page();await checked();let release!:()=>void;
 mockEngine.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));await press('p5.tap');expect(screen.getByText(i18n.t('p134.starting'))).toBeTruthy();
 if(reason==='cancel')await press('p5.cancel');else await act(async()=>{usePreferences.setState({language:'ta'});await i18n.changeLanguage('ta');});
 await act(async()=>release());expect(mockDriver.start).not.toHaveBeenCalled();expect(screen.queryByText(i18n.t('p134.starting'))).toBeNull();expect(screen.queryByTestId('microphone-listening-ring')).toBeNull();
});
