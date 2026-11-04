import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { notificationIdentity } from './identity';
import { useNotificationHealth } from './service';

export function NotificationResponses(){
 useEffect(()=>{
  let active=true;const seen=new Set<string>();
  function open(response:Notifications.NotificationResponse|null){
   if(!active||!response||response.actionIdentifier!==Notifications.DEFAULT_ACTION_IDENTIFIER)return;
   const notification=response.notification,id=notification.request.identifier,identity=notificationIdentity(id);
   const key=`${id}:${notification.date}`;
   if(!identity||seen.has(key))return;seen.add(key);
   // Router's local-param hook decodes again after query parsing. Preserve the
   // identifier's already-escaped origin so the alert can validate it unchanged.
   router.push({pathname:'/alert/[reminderId]',params:{reminderId:String(identity.reminderId),notificationId:encodeURIComponent(id)}});
   try{Notifications.clearLastNotificationResponse();}catch{/* Seen responses stay deduplicated for this mount. */}
  }
  const subscription=Notifications.addNotificationResponseReceivedListener(open);
  try{open(Notifications.getLastNotificationResponse());}catch{useNotificationHealth.setState({status:'error'});}
  return()=>{active=false;subscription.remove();};
 },[]);
 return null;
}
