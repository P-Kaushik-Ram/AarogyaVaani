import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { renderAsync,act,waitFor } from '@testing-library/react-native';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,apiAddress:()=> 'https://fixture.example'}));
jest.mock('../src/features/notifications/service',()=>({refreshNotifications:jest.fn().mockResolvedValue(undefined),reconcileReminders:jest.fn().mockResolvedValue([])}));
import { NotificationLifecycle } from '../src/features/notifications/Lifecycle';
import { refreshNotifications,reconcileReminders } from '../src/features/notifications/service';
import { usePreferences } from '../src/store/preferences';
import { reminderQueryOptions } from '../src/features/reminders/query';
let client:QueryClient;
let listener:(state:AppStateStatus)=>void;
const remove=jest.fn();
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});(reconcileReminders as jest.Mock).mockResolvedValue([]);usePreferences.setState({ready:true,serverAddress:'https://fixture.example',language:'en'});jest.spyOn(AppState,'addEventListener').mockImplementation((event,callback)=>{listener=callback;return {remove};});});
afterEach(()=>{client.clear();jest.restoreAllMocks();});
const page=()=>renderAsync(<QueryClientProvider client={client}><NotificationLifecycle/></QueryClientProvider>);
test('launch and foreground refill local schedules before backend reconciliation, then clean up listener',async()=>{
 const view=await page();await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(1));
 expect((refreshNotifications as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((reconcileReminders as jest.Mock).mock.invocationCallOrder[0]);
 await act(async()=>{listener('background');});expect(reconcileReminders).toHaveBeenCalledTimes(1);
 await act(async()=>{listener('active');});await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(2));expect(client.getQueryData(['reminders','https://fixture.example'])).toEqual([]);await view.unmountAsync();expect(remove).toHaveBeenCalled();
});
test('offline launch repairs local schedules even when the backend cannot reconcile',async()=>{
 (reconcileReminders as jest.Mock).mockRejectedValueOnce(new Error('network'));await page();await waitFor(()=>expect(client.getQueryState(['reminders','https://fixture.example'])?.status).toBe('error'));expect(refreshNotifications).toHaveBeenCalledTimes(1);expect(reconcileReminders).toHaveBeenCalledTimes(1);
});
test('screen, lifecycle and repeated foreground events share one pending reconciliation',async()=>{
 let resolve!:(v:[])=>void;(reconcileReminders as jest.Mock).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const first=client.fetchQuery(reminderQueryOptions('https://fixture.example/'));await page();
 await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(1));
 await act(async()=>{listener('active');listener('active');});expect(reconcileReminders).toHaveBeenCalledTimes(1);
 await act(async()=>resolve([]));await first;expect(refreshNotifications).toHaveBeenCalledTimes(1);
});
test('language changes force local notification text repair without an invalidation refetch',async()=>{
 await page();await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(1));
 await act(async()=>usePreferences.setState({language:'hi'}));await waitFor(()=>expect(reconcileReminders).toHaveBeenCalledTimes(2));expect(refreshNotifications).toHaveBeenCalledTimes(2);
});
