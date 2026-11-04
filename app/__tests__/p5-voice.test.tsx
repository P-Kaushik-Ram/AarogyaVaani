import React from 'react';
import { AppState,AppStateStatus,Platform } from 'react-native';
import { act,renderAsync,screen,fireEvent } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { VoiceDriver,VoiceEvents } from '../src/features/voice/session';
let mockDriver:VoiceDriver,mockEvents:VoiceEvents,mockBlurs:(()=>void)[],mockBackgrounds:((value:AppStateStatus)=>void)[],mockMissing=false;
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useLocalSearchParams:()=>({}),useFocusEffect:(callback:()=>()=>void)=>{require('react').useEffect(()=>{const cleanup=callback();mockBlurs.push(cleanup);return cleanup;},[callback]);}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/features/voice/native',()=>{
 const {VoiceSession,VoiceFailure}=require('../src/features/voice/session');
 return {voiceSession:new VoiceSession(()=>{if(mockMissing)throw new VoiceFailure('nativeMissing');return mockDriver;})};
});
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
const valid:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:'Calcium',times:['10:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'Confirm details',language:'en'}};
let api:any;
beforeEach(async()=>{
 jest.replaceProperty(Platform,'OS','android');mockMissing=false;
 mockBlurs=[];mockBackgrounds=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((name,callback)=>{if(name==='change')mockBackgrounds.push(callback);return {remove:jest.fn()};});
 mockDriver={available:jest.fn(()=>true),locales:jest.fn(async()=>['en-IN','hi-IN','ta-IN','ml-IN','kn-IN','te-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),subscribe:jest.fn(events=>{mockEvents=events;return jest.fn();}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 voiceSession.reset({});await i18n.changeLanguage('en');usePreferences.setState({language:'en',textSize:'standard',theme:'dark',storageError:false,serverAddress:'https://fixture.example'});
 api={languages:jest.fn(async()=>['en','hi','ta','ml','kn','te'].map(code=>({code}))),analyze:jest.fn(async()=>valid)};
 (getApi as jest.Mock).mockReturnValue(api);(saveConfirmed as jest.Mock).mockReset().mockResolvedValue({medicine:'Calcium',times:['10:00'],days_of_week:'daily'});
});
afterEach(()=>{jest.restoreAllMocks();});
async function page(){const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return renderAsync(<QueryClientProvider client={cache}><I18nextProvider i18n={i18n}><ThemeProvider><TalkScreen/></ThemeProvider></I18nextProvider></QueryClientProvider>);}
async function press(key:string){await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t(key)})));}
async function listen(){await press('p5.tap');await act(async()=>mockEvents.start());}
async function final(text:string){await act(async()=>{mockEvents.result({isFinal:true,results:[{transcript:text}]});mockEvents.end();});}
function input(){return screen.getByLabelText(i18n.getFixedT(usePreferences.getState().language)('talk.input'));}

test('typed flow initializes no recognizer; speech becomes editable text and requires Check then explicit Save',async()=>{
 await page();expect(mockDriver.permission).not.toHaveBeenCalled();expect(mockDriver.start).not.toHaveBeenCalled();
 await listen();expect(screen.getByText(i18n.t('p5.listening'))).toBeTruthy();expect(input().props.editable).toBe(false);
 await act(async()=>mockEvents.result({isFinal:false,results:[{transcript:'Calcium'}]}));expect(input().props.value).toBe('');
 await final('Calcium at ten daily');expect(input().props.value).toBe('Calcium at ten daily');expect(input().props.editable).toBe(true);
 expect(api.analyze).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();expect(screen.queryByTestId('confirmation-card')).toBeNull();
 await act(async()=>fireEvent.changeText(input(),'Calcium at 10am every day'));await press('talk.send');
 expect(api.analyze).toHaveBeenCalledWith('Calcium at 10am every day','en');expect(screen.getByTestId('confirmation-card')).toBeTruthy();expect(saveConfirmed).not.toHaveBeenCalled();expect(voiceSession.getState().phase).toBe('idle');
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await act(async()=>{fireEvent.press(save);fireEvent.press(save);});expect(saveConfirmed).toHaveBeenCalledTimes(1);
});
test('speech checked by backend medical-safety rules never exposes Save',async()=>{
 api.analyze.mockResolvedValue({...valid,safety:{triggered:true,reason:'medical'}});await page();await listen();await final('What dose should I take?');await press('talk.send');
 expect(screen.getByText(i18n.t('care.body'))).toBeTruthy();expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(saveConfirmed).not.toHaveBeenCalled();
});
test.each(['en','hi','ta','ml','kn','te'] as const)('%s selected speech locale is used without promoting readiness',async language=>{
 usePreferences.setState({language});await i18n.changeLanguage(language);await page();await listen();expect(mockDriver.start).toHaveBeenCalledWith(language+'-IN');await final('test transcription');expect(input().props.value).toBe('test transcription');expect(api.analyze).not.toHaveBeenCalled();
});
test.each(['ml','kn','te'] as const)('%s attempts an unlisted locale, but preserves native rejection and typing',async language=>{
 (mockDriver.locales as jest.Mock).mockResolvedValue(['en-IN']);usePreferences.setState({language});await i18n.changeLanguage(language);await page();
 await press('p5.tap');expect(mockDriver.start).toHaveBeenCalledWith(language+'-IN');
 await act(async()=>{mockEvents.error({error:'language-not-supported',code:12});mockEvents.end();});expect(screen.getByText(i18n.t('p5.locale',{language:{ml:'മലയാളം',kn:'ಕನ್ನಡ',te:'తెలుగు'}[language]}))).toBeTruthy();
 expect(input().props.editable).toBe(true);expect(api.analyze).not.toHaveBeenCalled();
});

test.each(['permission','nativeMissing','network','noSpeech'])('%s offers visible error and editable typed fallback without losing existing text',async problem=>{
 await page();await act(async()=>fireEvent.changeText(input(),'Keep this text'));
 if(problem==='permission')(mockDriver.permission as jest.Mock).mockResolvedValue({granted:false,canAskAgain:false});
 if(problem==='nativeMissing')mockMissing=true;
 await press('p5.tap');
 if(problem==='network'||problem==='noSpeech')await act(async()=>{mockEvents.error({error:problem==='network'?'network':'no-speech'});mockEvents.end();});
 expect(screen.getByText(i18n.t('p5.'+problem))).toBeTruthy();expect(input().props.value).toBe('Keep this text');expect(input().props.editable).toBe(true);
 if(problem==='permission')expect(screen.getByRole('button',{name:i18n.t('p5.settings')})).toBeTruthy();expect(api.analyze).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
});
test.each(['cancel','blur','background','unmount','language','backend'])('%s discards late transcription and does not restart capture',async reason=>{
 const view=await page();await act(async()=>fireEvent.changeText(input(),'Original'));await listen();
 await act(async()=>{
  if(reason==='cancel')fireEvent.press(screen.getByRole('button',{name:i18n.t('p5.cancel')}));
  if(reason==='blur')mockBlurs.forEach(callback=>callback());
  if(reason==='background')mockBackgrounds.forEach(callback=>callback('background'));
  if(reason==='language')usePreferences.setState({language:'hi'});
  if(reason==='backend')usePreferences.setState({serverAddress:'https://other.example'});
 });
 if(reason==='unmount')await view.unmountAsync();
 expect(mockDriver.abort).toHaveBeenCalledTimes(1);await final('Must be discarded');expect(mockDriver.start).toHaveBeenCalledTimes(1);
 if(reason!=='unmount')expect(input().props.value).toBe('Original');expect(api.analyze).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
});
test('new capture clears stale confirmation; repeated Finish taps stop native capture only once',async()=>{
 await page();await act(async()=>fireEvent.changeText(input(),'Calcium at ten daily'));await press('talk.send');expect(screen.getByTestId('confirmation-card')).toBeTruthy();
 await listen();expect(screen.queryByTestId('confirmation-card')).toBeNull();const stop=screen.getByRole('button',{name:i18n.t('p5.stop')});await act(async()=>{fireEvent.press(stop);fireEvent.press(stop);});
 expect(mockDriver.stop).toHaveBeenCalledTimes(1);expect(screen.getByText(i18n.t('p5.processing'))).toBeTruthy();await final('Edited speech');expect(saveConfirmed).not.toHaveBeenCalled();
});
test('unverified provider locale list produces an honest visible warning',async()=>{
 (mockDriver.locales as jest.Mock).mockResolvedValue([]);await page();await listen();expect(screen.getByText(i18n.t('p5.localeUnknown',{language:'English'}))).toBeTruthy();await final('review this');
 expect(screen.getByText(i18n.t('p5.localeUnknown',{language:'English'}))).toBeTruthy();
 await act(async()=>usePreferences.setState({language:'hi'}));expect(voiceSession.getState().phase).toBe('idle');expect(input().props.value).toBe('review this');
});
test('Check and microphone in the same frame cannot overlap backend validation and native capture',async()=>{
 await page();await act(async()=>fireEvent.changeText(input(),'Calcium at ten daily'));
 await act(async()=>{fireEvent.press(screen.getByRole('button',{name:i18n.t('talk.send')}));fireEvent.press(screen.getByRole('button',{name:i18n.t('p5.tap')}));});
 expect(api.analyze).toHaveBeenCalledTimes(1);expect(mockDriver.permission).not.toHaveBeenCalled();expect(mockDriver.start).not.toHaveBeenCalled();expect(saveConfirmed).not.toHaveBeenCalled();
});


test.each(['en','hi','ta','ml','kn','te'] as const)('%s typed Unicode analysis is editable, routes correctly and saves only once after confirmation',async language=>{
 const names={en:'My Brand',hi:'मेरी दवा',ta:'என் மருந்து',ml:'എന്റെ മരുന്ന്',kn:'ನನ್ನ ಔಷಧ',te:'నా మందు'};
 const result={...valid,detected_language:language,draft:{...valid.draft!,medicine:names[language]},reply:{text:'Review',language}};
 api.analyze.mockResolvedValue(result);usePreferences.setState({language});await i18n.changeLanguage(language);await page();
 const sentence=i18n.t('talk.example');await act(async()=>fireEvent.changeText(input(),sentence));
 expect(input().props.value).toBe(sentence);expect(api.analyze).not.toHaveBeenCalled();await press('talk.send');
 expect(api.analyze).toHaveBeenCalledWith(sentence,language);expect(screen.getByTestId('confirmation-card')).toBeTruthy();expect(saveConfirmed).not.toHaveBeenCalled();
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await act(async()=>{fireEvent.press(save);fireEvent.press(save);});
 expect(saveConfirmed).toHaveBeenCalledTimes(1);expect(saveConfirmed).toHaveBeenCalledWith('https://fixture.example',result);expect(mockDriver.start).not.toHaveBeenCalled();
});
