import React,{useState} from 'react';
import { Pressable,View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { AppText } from './Text';
import { TextButton } from './Button';
import { errorKey } from '../../services/api/client';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { metrics } from '../../design';

// Presentation only. Request/refetch/cache behavior stays with the caller.
export function ConnectionStatus({error,secondaryError,loading=false,cached=false,onRetry}:{error?:unknown;secondaryError?:unknown;loading?:boolean;cached?:boolean;onRetry:()=>void}){
 const {t}=useTranslation(),net=useNetInfo(),{colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth),[expanded,setExpanded]=useState(false);
 const offline=net.isConnected===false||net.isInternetReachable===false;
 if(!offline&&!error&&!secondaryError&&!loading&&!cached)return null;
 const errors=[...new Set([error,secondaryError].filter(Boolean).map(errorKey))];
 const isConnectionError=(key:string)=>['api.network','api.timeout','api.server'].includes(key);
 const summaries=[...new Set(errors.map(key=>isConnectionError(key)?'connection.unavailable':key))];
 const details=errors.filter(isConnectionError);
 const hasDetails=offline||details.length>0;
 return <View testID="connection-status" style={[s.connection,errors.length>0&&s.connectionError]} accessibilityLiveRegion="polite">
  <View style={s.connectionRow}>
  <View testID="connection-indicator" style={s.connectionIndicator} accessible={false}><WarningCircleIcon size={metrics.size.iconSmall} color={errors.length>0?colors.danger:colors.accent}/></View>
  <View style={s.connectionCopy}>
   {summaries.map(key=><AppText key={key} variant="Caption" accessibilityRole="alert">{t(key)}</AppText>)}
   {offline&&!errors.length&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{t('connection.offline')}</AppText>}
   {cached&&<AppText variant="Caption">{t('p43.cached')}</AppText>}
   {loading&&<AppText variant="Caption">{t('loading.label')}</AppText>}
  </View>
  {(!!error||!!secondaryError||offline)&&<TextButton label={t('action.retry')} onPress={onRetry}/>}
  </View>
  {hasDetails&&<Pressable accessibilityRole="button" accessibilityLabel={t(expanded?'connection.hideDetails':'connection.showDetails')} accessibilityState={{expanded}} style={s.connectionDisclosure} onPress={()=>setExpanded(value=>!value)}><AppText variant="Caption" style={{color:colors.accent}}>{t(expanded?'connection.hideDetails':'connection.showDetails')}</AppText></Pressable>}
  {hasDetails&&expanded&&<View testID="connection-details" style={s.connectionDetails}>{details.map(key=><AppText key={key} variant="Caption">{t(key)}</AppText>)}{offline&&<AppText variant="Caption">{t('p2.offline')}</AppText>}</View>}
 </View>;
}
