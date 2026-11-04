import React, { useEffect, useRef } from 'react';
import { ScrollView, View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { QuestionIcon } from 'phosphor-react-native/src/icons/Question';
import { useTranslation } from 'react-i18next';
import { AppText } from './Text';
import { IconButton } from './IconButton';
import { Banner } from './Banner';
import { CopyKey } from '../../i18n';
import { usePreferences } from '../../store/preferences';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { GlassLight } from './Glass';
import { stitchStyles } from '../../design/stitch';
import { useStartup } from '../../startup/Startup';
import { BrandHeader } from '../brand/BrandIdentity';
import { brandStyles } from '../../design/branding';
export function Screen({titleKey,children,back=true,settings=false,help=false,phase=false,scrollToEndKey,appearance,footer,brandVariant='header'}:{titleKey:CopyKey;children:React.ReactNode;back?:boolean;settings?:boolean;help?:boolean;phase?:boolean;scrollToEndKey?:string;appearance?:'stitch';footer?:React.ReactNode;brandVariant?:'header'|'about'}) {
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth),storageError=usePreferences(v=>v.storageError);
 const scroll=useRef<ScrollView>(null),pendingScroll=useRef(false);
 const {routeLaidOut}=useStartup();
 useEffect(()=>{pendingScroll.current=!!scrollToEndKey;if(scrollToEndKey)scroll.current?.scrollToEnd({animated:false});},[scrollToEndKey]);
 return <SafeAreaView onLayout={routeLaidOut} edges={back?['top','left','right','bottom']:['top','left','right']} style={s.fill}>
  <GlassLight ambient/>
  <KeyboardAvoidingView style={s.transparentFill} behavior={Platform.OS==='ios'?'padding':'height'}>
   <ScrollView ref={scroll} testID="screen-scroll" contentContainerStyle={[s.content,appearance==='stitch'&&stitchStyles(colors,borderWidth).content]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onContentSizeChange={()=>{if(pendingScroll.current){scroll.current?.scrollToEnd({animated:false});pendingScroll.current=false;}}}>
    <View style={s.header}>
     {brandVariant!=='about'&&<BrandHeader leading={back&&<IconButton compact icon={ArrowLeftIcon} label={t('action.back')} onPress={()=>router.canGoBack()?router.back():router.replace('/today')}/>} actions={settings&&<IconButton compact icon={GearSixIcon} label={t('settings.title')} onPress={()=>router.push('/settings')}/>}/>}
     {(back&&titleKey!=='app.name'||titleKey==='tab.medicines'||titleKey==='tab.talk')&&<View style={s.inline}>
      {brandVariant==='about'&&back&&<IconButton compact icon={ArrowLeftIcon} label={t('action.back')} onPress={()=>router.canGoBack()?router.back():router.replace('/today')}/>}
      <AppText variant={titleKey==='tab.talk'?'Caption':'DashboardTitle'} accessibilityRole="header" style={brandStyles.pageTitle}>{t(titleKey==='tab.medicines'&&!back?'p4.yourMedicines':titleKey==='tab.talk'?'p43.createReminder':titleKey)}</AppText>
      {help&&<IconButton compact icon={QuestionIcon} label={t('help.title')} onPress={()=>router.push('/help')}/>}
     </View>}
    </View>
    {storageError&&<Banner message={t('error.storage')}/>}{phase&&<Banner message={t('phase.notice')}/>}{children}
   </ScrollView>
   {footer}
  </KeyboardAvoidingView>
 </SafeAreaView>;
}
