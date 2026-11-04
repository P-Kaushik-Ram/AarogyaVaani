import React from 'react';
import { renderAsync,screen,act,fireEvent,within } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()},useLocalSearchParams:()=>({id:'1'}),useFocusEffect:()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:false,isInternetReachable:false})}));
jest.mock('../src/features/reminders/data',()=>({...jest.requireActual('../src/features/reminders/data'),useReminders:()=>mockQuery}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,getApi:()=>({hasPendingCreate:async()=>false}),apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:()=>({status:'denied',count:0}),cancelConfirmed:jest.fn()}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { MedicinesScreen,ReminderDetail } from '../src/features/reminders/Screens';
import { DailyProgress } from '../src/features/tracking/TrackingUI';
import { ApiStatus } from '../src/components/ui/ApiStatus';
import { ApiError } from '../src/services/api/client';
let mockQuery:any;
const reminder={id:1,medicine:'Long medicine '.repeat(12),times:['08:00','20:00'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
beforeEach(async()=>{await i18n.changeLanguage('en');mockQuery={data:[reminder],isCached:true,isPending:true,isFetching:true,isSuccess:false,refetch:jest.fn()};});
function page(children:React.ReactNode){return renderAsync(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{gcTime:0}}})}><I18nextProvider i18n={i18n}><ThemeProvider>{children}</ThemeProvider></I18nextProvider></QueryClientProvider>);}
test('Medicines keeps cached data/count and separate complete time labels without stale Loading while request is pending',async()=>{
 await page(<MedicinesScreen/>);const card=within(screen.getByTestId('medicine-card-1'));expect(card.getByText(reminder.medicine).props.numberOfLines).toBeUndefined();
 expect(card.getByText('08:00').props.numberOfLines).toBe(1);expect(card.getByText('20:00').props.numberOfLines).toBe(1);expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();expect(screen.getByText(i18n.t('p4.count',{count:1}))).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('connection.showDetails')})));
 expect(screen.getAllByText(i18n.t('p2.offline'))).toHaveLength(1);
});
test('cached empty Medicines is truthful before network settles',async()=>{
 mockQuery.data=[];await page(<MedicinesScreen/>);expect(screen.getByText(i18n.t('medicine.empty'))).toBeTruthy();expect(screen.queryByText(i18n.t('loading.label'))).toBeNull();
});
test('failed detail refresh retains cached schedule with announced error and explicit retry',async()=>{
 mockQuery={...mockQuery,isPending:false,isFetching:false,error:new ApiError('timeout')};await page(<ReminderDetail/>);
 expect(screen.getByText(reminder.medicine)).toBeTruthy();expect(screen.getByText(/08:00, 20:00/)).toBeTruthy();expect(screen.getByRole('alert')).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('action.retry')})));expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
});
test('failed tracking read does not show a perpetual loading or false completed state',async()=>{
 await page(<DailyProgress doses={[]} ready={false} failed/>);expect(screen.getByText(i18n.t('p8.error'))).toBeTruthy();expect(screen.queryByText(i18n.t('p8.loading'))).toBeNull();expect(screen.queryByRole('progressbar')).toBeNull();
});
test.each(['network','timeout','auth','server','storage'] as const)('%s failures are announced with truthful recovery',async kind=>{
 await page(<ApiStatus error={new ApiError(kind)} onRetry={()=>{}}/>);expect(within(screen.getByRole('alert')).getByText(i18n.t(`api.${kind}`))).toBeTruthy();expect(screen.queryByText(i18n.t('reminder.saved'))).toBeNull();
});
