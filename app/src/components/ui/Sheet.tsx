import React from 'react';
import { Modal, View, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function Sheet({visible,title,onClose,children}:{visible:boolean;title:string;onClose:()=>void;children:React.ReactNode}) {
 const {colors,reduceMotion}=useTheme(),s=createStyles(colors),{t}=useTranslation(),insets=useSafeAreaInsets();
 return <Modal visible={visible} transparent animationType={reduceMotion?'none':'slide'} onRequestClose={onClose} statusBarTranslucent><View style={s.scrim}><Pressable style={s.scrimDismiss} accessibilityRole="button" accessibilityLabel={t('action.close')} onPress={onClose}/><View accessibilityViewIsModal style={[s.sheet,{paddingBottom:Math.max(insets.bottom,metrics.space.screen)}]}><View style={s.handle}/><AppText variant="H2" accessibilityRole="header">{title}</AppText><ScrollView contentContainerStyle={s.stack} keyboardShouldPersistTaps="handled">{children}<Pressable accessibilityRole="button" accessibilityLabel={t('action.close')} style={s.textButton} onPress={onClose}><AppText style={{color:colors.accent}}>{t('action.close')}</AppText></Pressable></ScrollView></View></View></Modal>;
}
