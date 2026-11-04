import React from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { PrimaryButton,SecondaryButton,TextButton } from '../../components/ui/Button';
import { LanguageList } from '../../components/ui/LanguageList';
import { BrandSymbol } from '../../components/brand/BrandIdentity';
import { Banner } from '../../components/ui/Banner';
import { usePreferences } from '../../store/preferences';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { usePhaseNotice } from '../../hooks/usePhaseNotice';
import { CopyKey } from '../../i18n';
export function LanguageScreen(){const p=usePreferences(),{t}=useTranslation();return <Screen titleKey="onboarding.language" back={false}><AppText language="hi">{t('onboarding.language',{lng:'hi'})}</AppText><AppText language="ta">{t('onboarding.language',{lng:'ta'})}</AppText><LanguageList value={p.language} onChange={language=>p.patch({language})}/><AppText variant="Caption">{t('language.draft')}</AppText><SecondaryButton label={t('settings.hc')} selected={p.theme==='hc'} onPress={()=>p.patch({theme:p.theme==='hc'?'dark':'hc'})}/><PrimaryButton label={t('action.continue')} onPress={()=>router.push('/welcome')}/></Screen>;}
export function WelcomeScreen(){const {t}=useTranslation(),{colors}=useTheme(),s=createStyles(colors);return <Screen titleKey="app.name"><View style={s.center}><BrandSymbol startup/><AppText variant="H2" style={s.alignCenter}>{t('onboarding.welcome')}</AppText></View><AppText>{t('onboarding.steps')}</AppText><AppText>{t('privacy.consent')}</AppText><TextButton label={t('settings.privacy')} onPress={()=>router.push('/settings/privacy')}/><PrimaryButton label={t('action.continue')} onPress={()=>router.push('/permissions')}/></Screen>;}
export function PermissionsScreen(){const {t}=useTranslation(),phase=usePhaseNotice(),{colors}=useTheme(),s=createStyles(colors);const items:CopyKey[]=['health.notifications','health.alarms','health.microphone','health.battery'];return <Screen titleKey="onboarding.permissions" phase><AppText>{t('onboarding.reason')}</AppText>{items.map(key=><View key={key} style={[s.stack,s.divider]}><AppText variant="Title">{t(key)}</AppText><AppText variant="Caption">{t('health.unknown')}</AppText><SecondaryButton label={t('action.allow')} onPress={phase.show}/></View>)}<SecondaryButton label={t('health.testMinute')} onPress={phase.show}/><PrimaryButton label={t('action.continue')} onPress={()=>{usePreferences.getState().patch({onboarded:true});router.replace('/today');}}/>{phase.notice}</Screen>;}
