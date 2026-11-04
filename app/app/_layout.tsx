import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import '../src/i18n';
import { NotificationLifecycle } from '../src/features/notifications/Lifecycle';
import { NotificationResponses } from '../src/features/notifications/Responses';
import { StitchFoundation,ThemeProvider,useTheme } from '../src/design/ThemeProvider';
import { createStyles } from '../src/design/layout';
import { AppText } from '../src/components/ui/Text';
import { usePreferences,hydratePreferences } from '../src/store/preferences';
import { StartupProvider,useStartup } from '../src/startup/Startup';
import { markStartup } from '../src/startup/timing';
import { revealContent } from '../src/startup/splash';
import { StartupBrand } from '../src/components/brand/BrandIdentity';
markStartup('root.module-ready');
const queryClient=new QueryClient();
function Navigation(){
 const {colors,reduceMotion}=useTheme(),s=createStyles(colors),ready=usePreferences(v=>v.ready),{t}=useTranslation();
 const {backgroundReady}=useStartup();
 useEffect(()=>{void hydratePreferences();},[]);
 if(!ready)return <View onLayout={()=>revealContent('shell.layout')} style={[s.fill,s.startup]} accessible accessibilityRole="progressbar" accessibilityLabel={t('starting.label')}><StartupBrand/><ActivityIndicator color={colors.accent}/><AppText accessibilityLiveRegion="polite">{t('starting.label')}</AppText></View>;
 return <>{backgroundReady&&<><NotificationLifecycle/><NotificationResponses/></>}<StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:s.fill,animation:reduceMotion?'none':'fade'}}><Stack.Screen name="alert/[reminderId]" options={{presentation:'fullScreenModal'}}/><Stack.Screen name="help" options={{presentation:'formSheet'}}/><Stack.Protected guard={__DEV__}><Stack.Screen name="dev/gallery"/></Stack.Protected></Stack></>;
}
function RootSurface(){const {colors}=useTheme();return <GestureHandlerRootView style={createStyles(colors).fill}><SafeAreaProvider><QueryClientProvider client={queryClient}><StartupProvider><Navigation/></StartupProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;}
export default function Root(){return <ThemeProvider><StitchFoundation><RootSurface/></StitchFoundation></ThemeProvider>;}
