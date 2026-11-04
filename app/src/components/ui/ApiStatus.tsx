import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNetInfo } from '@react-native-community/netinfo';
import { Banner } from './Banner';
import { errorKey } from '../../services/api/client';
export function ApiStatus({error,loading=false,onRetry,offlineNotice=true,language}:{language?:string;error?:unknown;loading?:boolean;onRetry?:()=>void;offlineNotice?:boolean}){
 const {t}=useTranslation(undefined,{lng:language}),net=useNetInfo();
 return <>{offlineNotice&&(net.isConnected===false||net.isInternetReachable===false)&&<Banner message={t('p2.offline')}/ >}{loading&&<Banner message={t('loading.label')}/ >}{!!error&&<Banner alert message={t(errorKey(error))} action={onRetry?t('action.retry'):undefined} onPress={onRetry}/>}</>;
}
