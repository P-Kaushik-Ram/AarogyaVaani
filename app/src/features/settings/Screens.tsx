import { NotificationStatus } from '../notifications/Status';
import { AlertSettings } from '../notifications/AlertSettings';
import { refreshNotifications, reconcileReminders, deleteConfirmed, openNotificationSettings, openAlarmSettings, openBatterySettings,useNotificationHealth } from '../notifications/service';
import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiStatus } from '../../components/ui/ApiStatus';
import { apiAddress, getApi, forgetDevice,assertAddressAllowed,activateBackendCutover } from '../../services/api/session';
import { approvedBackendCutover } from '../../../config/backendCutover';
import { normalizeBase } from '../../services/api/client';
import { View, Switch, Pressable } from 'react-native';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { GlobeIcon } from 'phosphor-react-native/src/icons/Globe';
import { MoonIcon } from 'phosphor-react-native/src/icons/Moon';
import { PersonArmsSpreadIcon } from 'phosphor-react-native/src/icons/PersonArmsSpread';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import type { Icon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/ui/Screen';
import { OfficialLogo } from '../../components/brand/OfficialLogo';
import { AppText } from '../../components/ui/Text';
import { PrimaryButton,SecondaryButton,TextButton,DestructiveButton } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { LanguageList } from '../../components/ui/LanguageList';
import { Banner } from '../../components/ui/Banner';
import { ClarifyChips } from '../../components/ui/ClarifyChips';
import { CareNote } from '../../components/chat/CareNote';
import { usePreferences } from '../../store/preferences';
import { usePhaseNotice } from '../../hooks/usePhaseNotice';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';
import { createStyles } from '../../design/layout';
import { TextSize,ThemeName } from '../../design';
import { getLanguage } from '../../../config/languages';
import { GlassCard } from '../../components/ui/Glass';
function SettingsRow({label,hint,icon:Glyph,onPress}:{label:string;hint?:string;icon:Icon;onPress:()=>void}){
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth),warm=stitchStyles(colors,borderWidth);
 return <Pressable accessibilityRole="button" accessibilityLabel={[label,hint].filter(Boolean).join(', ')} onPress={onPress} style={warm.settingsRow}>
  <View style={warm.settingsIcon}><Glyph size={stitch.icon} color={colors.accent}/></View><View style={s.shrink}><AppText variant="SectionLabel">{label}</AppText>{hint&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{hint}</AppText>}</View><CaretRightIcon size={stitch.icon} style={warm.iconFixed} color={colors.textSecondary}/>
 </Pressable>;
}
export function SettingsScreen(){return <StitchFoundation><SettingsContent/></StitchFoundation>;}
function SettingsContent(){
 const {t}=useTranslation(),p=usePreferences(),health=useNotificationHealth(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 return <Screen titleKey="settings.title" appearance="stitch">
  <GlassCard style={s.settingsCard}><SettingsRow icon={BellIcon} label={t('health.notifications')} hint={t(`p4.${health.status}Label`)} onPress={()=>router.push('/settings/notification-health')}/></GlassCard>
  {(health.status==='error'||health.status==='denied')&&<NotificationStatus compact/>}
  <GlassCard style={s.settingsCard}>
   <SettingsRow icon={GlobeIcon} label={t('settings.language')} hint={getLanguage(p.language).nativeName} onPress={()=>router.push('/settings/language-voice')}/>
  </GlassCard><GlassCard style={s.settingsCard}>
   <SettingsRow icon={MoonIcon} label={t('settings.appearance')} hint={t(`settings.${p.theme}`)} onPress={()=>router.push('/settings/text-theme')}/>
  </GlassCard><GlassCard style={s.settingsCard}>
   <SettingsRow icon={PersonArmsSpreadIcon} label={t('p4.accessibility')} hint={t('p4.accessibilityHint')} onPress={()=>router.push('/settings/text-theme')}/>
  </GlassCard>
  <GlassCard style={s.settingsCard}><SettingsRow icon={InfoIcon} label={t('settings.about')} hint={t('settings.version',{version:'1.0.0'})} onPress={()=>router.push('/settings/about')}/></GlassCard>
  <Banner message={t('about.safety')}/>
 </Screen>;
}
export function LanguageVoiceScreen(){
 const p=usePreferences(),{t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 return <StitchFoundation><Screen titleKey="settings.language" appearance="stitch">
  <LanguageList value={p.language} onChange={language=>p.patch({language})}/>
  <Banner message={t('voice.unverified')}/>
  <GlassCard style={s.card}><View style={s.eyebrow}><AppText variant="Title">{t('p11.setting')}</AppText><Switch accessible accessibilityRole="switch" accessibilityState={{checked:p.voiceResponses}} style={s.voiceSwitch} accessibilityLabel={t('p11.setting')} value={p.voiceResponses} onValueChange={voiceResponses=>p.patch({voiceResponses})} trackColor={{false:colors.borderStrong,true:colors.accent}} thumbColor={colors.textPrimary}/></View><AppText variant="Caption">{t('p11.settingHint')}</AppText></GlassCard>
  <AppText variant="Caption">{t('p11.cues')}</AppText>
  <AppText variant="Caption">{t('p11.privacy')}</AppText>
 </Screen></StitchFoundation>;
}
export function AppearanceScreen(){const p=usePreferences(),{t}=useTranslation(),{colors}=useTheme(),s=createStyles(colors);return <Screen titleKey="settings.appearance"><ClarifyChips selected={p.textSize} options={(['standard','large','extraLarge'] as const).map(value=>({value,label:t(`settings.${value}`)}))} onSelect={v=>p.patch({textSize:v as TextSize})}/><AppText variant="H2">{t('settings.preview')}</AppText><ClarifyChips selected={p.theme} options={(['dark','hc'] as const).map(value=>({value,label:t(`settings.${value}`)}))} onSelect={v=>p.patch({theme:v as ThemeName})}/><View style={s.rowSpread}><AppText>{t('settings.reduceMotion')}</AppText><Switch accessibilityLabel={t('settings.reduceMotion')} value={p.reduceMotion} onValueChange={reduceMotion=>p.patch({reduceMotion})} trackColor={{false:colors.borderStrong,true:colors.accent}} thumbColor={colors.textPrimary}/></View></Screen>;}
export function HealthScreen(){
 const {t}=useTranslation(),[busy,setBusy]=useState(false);
 async function enable(){if(busy)return;setBusy(true);try{await refreshNotifications(true);try{await reconcileReminders();}catch{}}finally{setBusy(false);}}
 return <Screen titleKey="settings.health" appearance="stitch"><AlertSettings/><NotificationStatus settingsLink={false}/><AppText>{t('p3.explain')}</AppText><PrimaryButton label={t('p3.enable')} disabled={busy} onPress={()=>void enable()}/><SecondaryButton label={t('health.reschedule')} disabled={busy} onPress={()=>void enable()}/><SecondaryButton label={t('health.notifications')} onPress={()=>void openNotificationSettings()}/><AppText>{t('p3.alarms')}</AppText><SecondaryButton label={t('health.alarms')} onPress={()=>void openAlarmSettings()}/><AppText>{t('p3.limits')}</AppText><SecondaryButton label={t('health.battery')} onPress={()=>void openBatterySettings()}/></Screen>;
}
export function PrivacyScreen(){
 const {t}=useTranslation(),cache=useQueryClient(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>();
 async function remove(){if(lock.current)return;lock.current=true;setBusy(true);setError(undefined);try{const api=getApi();await deleteConfirmed(api.base);await forgetDevice(api.base);cache.clear();await usePreferences.getState().reset();router.replace('/language');}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}}
 return <Screen titleKey="settings.privacy"><AppText>{t('privacy.body')}</AppText><AppText>{t('p5.privacy')}</AppText><AppText>{t('p11.privacy')}</AppText><AppText>{t('privacy.consent')}</AppText><DestructiveButton label={t('privacy.delete')} title={t('privacy.confirm')} body={t('privacy.body')} disabled={busy} onConfirm={()=>void remove()}/><ApiStatus loading={busy} error={error}/></Screen>;
}
export function AdvancedScreen(){
 const p=usePreferences(),[address,setAddress]=useState(p.serverAddress),{t}=useTranslation(),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState('');
 async function check(){if(busy)return;setBusy(true);setMessage('');setError(undefined);try{await getApi(address.trim()||process.env.EXPO_PUBLIC_API_URL||'').health();setMessage(t('p2.connected'));}catch(e){setError(e);}finally{setBusy(false);}}
 async function save(){if(busy)return;setBusy(true);try{const value=address.trim()?normalizeBase(address):'';await assertAddressAllowed(value||process.env.EXPO_PUBLIC_API_URL||'');p.patch({serverAddress:value});setMessage(t('reminder.saved'));setError(undefined);}catch(e){setError(e);}finally{setBusy(false);}}
 async function cutover(direction:'target'|'source'){if(busy||!approvedBackendCutover)return;setBusy(true);setError(undefined);try{await activateBackendCutover(approvedBackendCutover.id,true,direction);setMessage(t('p14.done'));}catch(e){setError(e);}finally{setBusy(false);}}
 return <Screen titleKey="settings.advanced"><TextField label={t('settings.server')} value={address} onChangeText={v=>{setAddress(v);setMessage('');}} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url"/><AppText>{t('p2.serverHelp')}</AppText><PrimaryButton label={t('action.save')} disabled={busy} onPress={()=>void save()}/><SecondaryButton label={t('action.check')} disabled={busy} onPress={()=>void check()}/>{approvedBackendCutover&&<><AppText>{t('p14.explain',{from:approvedBackendCutover.from,to:approvedBackendCutover.to})}</AppText><DestructiveButton label={t('p14.activate')} title={t('p14.activate')} body={t('p14.confirm')} disabled={busy} onConfirm={()=>void cutover('target')}/><DestructiveButton label={t('p14.rollback')} title={t('p14.rollback')} body={t('p14.confirm')} disabled={busy} onConfirm={()=>void cutover('source')}/></>}<ApiStatus loading={busy} error={error}/>{!!message&&<Banner message={message}/>}<AppText>{t('settings.version',{version:'1.0.0'})}</AppText></Screen>;
}
export function AboutScreen(){const {t}=useTranslation(),[taps,setTaps]=useState(0);return <Screen titleKey="settings.about" brandVariant="about"><OfficialLogo/><AppText variant="Caption">{t('p4.companion')}</AppText><AppText>{t('about.safety')}</AppText><CareNote/><AppText>{t('about.credits')}</AppText><SecondaryButton label={t('settings.privacy')} onPress={()=>router.push('/settings/privacy')}/><TextButton label={t('settings.version',{version:'1.0.0'})} onPress={()=>{setTaps(taps+1);if(taps+1>=5){setTaps(0);router.push('/settings/advanced');}}}/>{__DEV__&&<TextButton label={t('gallery.title')} onPress={()=>router.push('/dev/gallery')}/>}</Screen>;}
export function HelpScreen(){const {t}=useTranslation();return <Screen titleKey="help.title"><AppText>{t('help.body')}</AppText>{(['talk.example','help.view','help.cancel'] as const).map(key=><SecondaryButton key={key} label={t(key)} onPress={()=>router.push({pathname:'/talk',params:{example:t(key)}})}/>)}</Screen>;}
