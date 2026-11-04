import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { renderAsync,screen,fireEvent,waitFor,act } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()},useLocalSearchParams:()=>({id:'1'}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:true,isInternetReachable:true})}));
jest.mock('../src/components/ui/Screen',()=>({Screen:({children}:any)=>children}));
jest.mock('../src/components/brand/VaaniLamp',()=>({VaaniLamp:()=>null}));
jest.mock('../src/hooks/usePhaseNotice',()=>({usePhaseNotice:()=>({show:jest.fn(),notice:null})}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:jest.fn(),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({
 useNotificationHealth:()=>({status:'unknown',count:0,until:0,offline:false}),
 saveConfirmed:jest.fn((base,analysis)=>require('../src/services/api/session').getApi(base).create(analysis,true)),
 cancelConfirmed:jest.fn((base,id)=>require('../src/services/api/session').getApi(base).cancel(id,true)),
 deleteConfirmed:jest.fn(base=>require('../src/services/api/session').getApi(base).deleteMe(true)),
 reconcileReminders:jest.fn(base=>require('../src/services/api/session').getApi(base).list()),
 refreshNotifications:jest.fn(),openNotificationSettings:jest.fn(),openAlarmSettings:jest.fn(),openBatterySettings:jest.fn(),
}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { TalkScreen } from '../src/features/chat/TalkScreen';
import { MedicinesScreen,ReminderDetail,TodayScreen } from '../src/features/reminders/Screens';
import { usePreferences } from '../src/store/preferences';
import { getApi } from '../src/services/api/session';
import { ApiError } from '../src/services/api/client';
import { Analysis } from '../src/services/api/models';
const analysis:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:'metformin',times:['20:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{text:'Please confirm',language:'en'}};
const reminder={...analysis.draft,id:1,user_id:'fixture',status:'active',language:'en',timezone:'Asia/Kolkata',updated_at:'2026-10-17T00:00:00Z'};
let api:any;
async function press(target:any){await act(async()=>{fireEvent.press(target);});}
async function change(target:any,value:string){await act(async()=>{fireEvent.changeText(target,value);});}
beforeEach(async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);await i18n.changeLanguage('en');usePreferences.setState({language:'en',serverAddress:''});
 api={languages:jest.fn().mockResolvedValue([{code:'en'},{code:'hi'},{code:'ta'}]),analyze:jest.fn().mockResolvedValue(analysis),create:jest.fn().mockResolvedValue(reminder),list:jest.fn().mockResolvedValue([]),cancel:jest.fn().mockResolvedValue({deleted:true}),hasPendingCreate:jest.fn().mockResolvedValue(false),acknowledgeCreate:jest.fn().mockResolvedValue(undefined)};(getApi as jest.Mock).mockReturnValue(api);
});
afterEach(()=>jest.restoreAllMocks());
async function renderPage(page:React.ReactElement){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return renderAsync(<QueryClientProvider client={client}><I18nextProvider i18n={i18n}><ThemeProvider>{page}</ThemeProvider></I18nextProvider></QueryClientProvider>);}
async function send(){await change(screen.getByLabelText(i18n.t('talk.input')),'Remind me to take Metformin at 8 PM every day.');await press(screen.getByRole('button',{name:i18n.t('talk.send')}));await waitFor(()=>expect(api.analyze).toHaveBeenCalled());}
test('analyze requires explicit Save, double Save submits once, success follows persistence',async()=>{
 let resolve!:(v:any)=>void;api.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());expect(api.create).not.toHaveBeenCalled();
 const save=screen.getByRole('button',{name:i18n.t('action.save')});await press(save);await press(save);expect(api.create).toHaveBeenCalledTimes(1);expect(screen.queryByText(i18n.t('reminder.saved'))).toBeNull();
 await act(async()=>resolve(reminder));await waitFor(()=>expect(screen.getByText(i18n.t('reminder.saved'))).toBeTruthy());
});
test('editing text invalidates previously analyzed confirmation',async()=>{await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());await change(screen.getByLabelText(i18n.t('talk.input')),'different sentence');expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(api.create).not.toHaveBeenCalled();});
test('missing name and ambiguous time cannot save; selecting time does not guess medicine',async()=>{api.analyze.mockResolvedValue({...analysis,draft:{...analysis.draft,medicine:null,times:[]},missing:['medicine','time_ambiguous'],candidates:{times:['08:00','20:00']}});await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByText(i18n.t('p2.missing.medicine'))).toBeTruthy());expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();await press(screen.getByRole('button',{name:'20:00'}));expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(api.create).not.toHaveBeenCalled();});
test('medical safety response never presents a Save action',async()=>{api.analyze.mockResolvedValue({...analysis,safety:{triggered:true,reason:'phrase'}});await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByText(i18n.t('care.body'))).toBeTruthy());expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(api.create).not.toHaveBeenCalled();});
test('unsupported UI language shows translated limitation without substituting another language',async()=>{usePreferences.setState({language:'ml'});await i18n.changeLanguage('ml');await renderPage(<TalkScreen/>);await change(screen.getByLabelText(i18n.t('talk.input')),'മരുന്ന്');await press(screen.getByRole('button',{name:i18n.t('talk.send')}));await waitFor(()=>expect(screen.getByText(i18n.t('api.unsupported'))).toBeTruthy());expect(api.analyze).not.toHaveBeenCalled();expect(api.create).not.toHaveBeenCalled();});
test('server/network failure is visible and creates nothing',async()=>{api.analyze.mockRejectedValue(new ApiError('network'));await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByText(i18n.t('api.network'))).toBeTruthy());expect(api.create).not.toHaveBeenCalled();});
test('uncertain Save disables further Save and never claims success',async()=>{api.create.mockRejectedValue(new ApiError('timeout'));await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());await press(screen.getByRole('button',{name:i18n.t('action.save')}));await waitFor(()=>expect(screen.getByText(i18n.t('api.uncertain'))).toBeTruthy());await press(screen.getByRole('button',{name:i18n.t('action.save')}));expect(api.create).toHaveBeenCalledTimes(1);expect(screen.queryByText(i18n.t('reminder.saved'))).toBeNull();});
test('empty Medicines is an actual backend empty list',async()=>{await renderPage(<MedicinesScreen/>);await waitFor(()=>expect(screen.getByText(i18n.t('medicine.empty'))).toBeTruthy());expect(api.list).toHaveBeenCalled();});
test('lists medicine, times and recurrence from server',async()=>{api.list.mockResolvedValue([reminder]);await renderPage(<MedicinesScreen/>);await waitFor(()=>expect(screen.getByRole('button',{name:/metformin.*20:00/})).toBeTruthy());expect(screen.getByText(/Every day/)).toBeTruthy();});
test('list errors do not show a false empty state',async()=>{api.list.mockRejectedValue(new ApiError('auth'));await renderPage(<MedicinesScreen/>);await waitFor(()=>expect(screen.getByText(i18n.t('api.auth'))).toBeTruthy());expect(screen.queryByText(i18n.t('medicine.empty'))).toBeNull();});
test('Today shows daily reminder and the next card without claiming taken or notification status',async()=>{api.list.mockResolvedValue([reminder]);await renderPage(<TodayScreen/>);await waitFor(()=>expect(screen.getAllByText('metformin')).toHaveLength(2));const states=screen.getAllByTestId(/^dose-status-/);expect(states).toHaveLength(1);for(const state of states){expect(state).toHaveTextContent(i18n.t('p8.pending'));expect(state).not.toHaveTextContent(i18n.t('dose.taken'));}});
test('cancel confirmation can be dismissed; only explicit Delete calls backend',async()=>{
 api.list.mockResolvedValue([reminder]);await renderPage(<ReminderDetail/>);await waitFor(()=>expect(screen.getByText('metformin')).toBeTruthy());const label=i18n.t('action.delete');await press(screen.getByRole('button',{name:label}));expect(api.cancel).not.toHaveBeenCalled();await press(screen.getByRole('button',{name:i18n.t('action.cancel')}));expect(api.cancel).not.toHaveBeenCalled();await press(screen.getByRole('button',{name:label}));const buttons=screen.getAllByRole('button',{name:label});await press(buttons[buttons.length-1]);await waitFor(()=>expect(api.cancel).toHaveBeenCalledWith(1,true));expect(screen.getByText(i18n.t('medicine.removed'))).toBeTruthy();
});
test('pending creation needs successful list and explicit acknowledgement',async()=>{api.hasPendingCreate.mockResolvedValue(true);await renderPage(<MedicinesScreen/>);await waitFor(()=>expect(screen.getByText(i18n.t('api.uncertain'))).toBeTruthy());expect(api.acknowledgeCreate).not.toHaveBeenCalled();await press(screen.getByRole('button',{name:i18n.t('p2.reviewed')}));await waitFor(()=>expect(api.acknowledgeCreate).toHaveBeenCalledTimes(1));});

test('explicit manual medicine and ambiguous time selection require a later Save',async()=>{api.analyze.mockResolvedValue({...analysis,draft:{...analysis.draft,medicine:null,times:[]},missing:['medicine','time_ambiguous'],candidates:{times:['08:00','20:00']}});await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByLabelText(i18n.t('medicine.name'))).toBeTruthy());await change(screen.getByLabelText(i18n.t('medicine.name')),'User specified medicine');await press(screen.getByRole('button',{name:'20:00'}));expect(api.create).not.toHaveBeenCalled();await press(screen.getByRole('button',{name:i18n.t('action.save')}));await waitFor(()=>expect(api.create).toHaveBeenCalledWith(expect.objectContaining({draft:expect.objectContaining({medicine:'User specified medicine',times:['20:00']})}),true));});

test('P2.1 short command shows unresolved recurrence and requires a corrected explicit schedule before Save',async()=>{
 api.analyze.mockResolvedValueOnce({...analysis,draft:{...analysis.draft,medicine:'calcium',times:['10:00'],days_of_week:null},missing:['frequency']});await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByText(i18n.t('p2.missing.frequency'))).toBeTruthy());expect(screen.queryByText(i18n.t('medicine.daily'))).toBeNull();expect(screen.queryByRole('button',{name:i18n.t('action.save')})).toBeNull();expect(api.create).not.toHaveBeenCalled();
 api.analyze.mockResolvedValue({...analysis,draft:{...analysis.draft,medicine:'calcium',times:['10:00']}});await change(screen.getByLabelText(i18n.t('talk.input')),'Calcium at 10am daily');await press(screen.getByRole('button',{name:i18n.t('talk.send')}));await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());expect(api.create).not.toHaveBeenCalled();await press(screen.getByRole('button',{name:i18n.t('action.save')}));await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
});


test('P3 unsaved draft never reaches local scheduling',async()=>{
 const {saveConfirmed}=require('../src/features/notifications/service');await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());expect(saveConfirmed).not.toHaveBeenCalled();
});
test('P3 explicit Save invokes confirmed local scheduling once',async()=>{
 const {saveConfirmed}=require('../src/features/notifications/service');await renderPage(<TalkScreen/>);await send();await waitFor(()=>expect(screen.getByRole('button',{name:i18n.t('action.save')})).toBeTruthy());await press(screen.getByRole('button',{name:i18n.t('action.save')}));await waitFor(()=>expect(saveConfirmed).toHaveBeenCalledTimes(1));
});
