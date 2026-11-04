import React from 'react';
import { Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandStyles } from '../../design/branding';

export function OfficialLogo(){
 const {t}=useTranslation();
 return <Image testID="official-logo" source={require('../../../assets/branding/aarogyavaani_full_header.png')} resizeMode="contain" style={brandStyles.about} accessible accessibilityRole="image" accessibilityLabel={t('app.name')}/>;
}
