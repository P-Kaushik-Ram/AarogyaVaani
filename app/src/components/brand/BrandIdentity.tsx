import React from 'react';
import { Image,View,Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandStyles } from '../../design/branding';
import { AppText } from '../ui/Text';
import { useTheme } from '../../design/ThemeProvider';

export function BrandSymbol({startup=false}:{startup?:boolean}){
 return <Image testID="brand-symbol" source={require('../../../assets/branding/aarogyavaani_app_icon.png')} resizeMode="contain" style={startup?brandStyles.startupSymbol:brandStyles.symbol} accessible={false} importantForAccessibility="no"/>;
}

export function BrandHeader({leading,actions}:{leading?:React.ReactNode;actions?:React.ReactNode}){
 const {t}=useTranslation(),{colors}=useTheme();
 return <View testID="brand-header" style={brandStyles.header}>
  {leading}<BrandSymbol/>
  <View style={brandStyles.identity}><AppText variant="DashboardTitle" accessibilityRole="header" accessibilityLabel={t('app.name')}>{t('brand.nameStart')}<Text style={{color:colors.accent}}>{t('brand.nameEnd')}</Text></AppText><AppText variant="Caption" style={{color:colors.textSecondary}}>{t('p4.companion')}</AppText></View>
  {actions&&<View style={brandStyles.navigation}>{actions}</View>}
 </View>;
}

export function StartupBrand(){
 const {t}=useTranslation();
 return <View testID="startup-brand" style={brandStyles.startup}><BrandSymbol startup/><AppText variant="H2">{t('app.name')}</AppText></View>;
}
