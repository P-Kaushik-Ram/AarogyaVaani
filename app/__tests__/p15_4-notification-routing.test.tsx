import React from 'react';
import { renderAsync } from '@testing-library/react-native';
jest.mock('expo-router',()=>({router:{push:jest.fn()}}));
jest.mock('expo-notifications',()=>({DEFAULT_ACTION_IDENTIFIER:'default',addNotificationResponseReceivedListener:jest.fn(()=>({remove:jest.fn()})),getLastNotificationResponse:jest.fn(),clearLastNotificationResponse:jest.fn()}));
jest.mock('../src/features/reminders/cache',()=>({readCachedReminders:jest.fn()}));
jest.mock('../src/features/notifications/service',()=>({useNotificationHealth:{setState:jest.fn()}}));
import { router } from 'expo-router';
import * as N from 'expo-notifications';
import { NotificationResponses } from '../src/features/notifications/Responses';
import { notificationIdentity,resolveAlert } from '../src/features/notifications/identity';
import { readCachedReminders } from '../src/features/reminders/cache';
// These are the installed Router implementations, not a simulated URL decoder.
const {resolveHref}=require('expo-router/build/link/href');
const {getStateFromPath}=require('expo-router/build/fork/getStateFromPath');
const {useLocalSearchParams}=require('expo-router/build/hooks/useLocalSearchParams');
const {LocalRouteParamsContext}=require('expo-router/build/Route');
const base='https://review.example.test';
const at=1792605660000,id=`av3:${encodeURIComponent(base)}:5:${at}`;
const reminder={id:5,medicine:'P15 review medicine',times:['23:31'],days_of_week:'daily',timezone:'Asia/Kolkata',status:'active'};
async function localParams(href:unknown){
 const state=getStateFromPath(resolveHref(href),{screens:{Alert:'alert/:reminderId'}});
 let received:Record<string,string>={};
 function Probe(){received=useLocalSearchParams();return null;}
 const view=await renderAsync(<LocalRouteParamsContext.Provider value={state.routes[0].params}><Probe/></LocalRouteParamsContext.Provider>);
 await view.unmountAsync();return received;
}
beforeEach(()=>{(readCachedReminders as jest.Mock).mockResolvedValue([reminder]);});

test('unprotected v4 identifier is decoded again by the real Router hook and rejected',async()=>{
 const params=await localParams({pathname:'/alert/[reminderId]',params:{reminderId:'5',notificationId:id}});
 expect(params.notificationId).toBe(`av3:${base}:5:${at}`);
 expect(notificationIdentity(params.notificationId)).toBeNull();
});

test.each([id,id+':snooze'])('actual notification route preserves the opaque ID and resolves its original dose: %s',async identifier=>{
 (N.getLastNotificationResponse as jest.Mock).mockReturnValue({actionIdentifier:'default',notification:{date:at,request:{identifier}}});
 const view=await renderAsync(<NotificationResponses/>);
 const href=(router.push as jest.Mock).mock.calls[0][0];await view.unmountAsync();
 const params=await localParams(href);
 expect(params.notificationId).toBe(identifier);
 expect(notificationIdentity(params.notificationId)).toEqual({scope:base,reminderId:5,at});
 await expect(resolveAlert(params.notificationId)).resolves.toMatchObject({key:`5:${at}`,medicine:'P15 review medicine',time:'23:31',timezone:'Asia/Kolkata',status:'pending'});
 expect(readCachedReminders).toHaveBeenCalledWith(base);
});
