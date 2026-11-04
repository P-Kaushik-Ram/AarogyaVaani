import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTypography } from '../../design/useTypography';
import { TypeStyle } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
export function AppText({variant='Body',language,style,...props}:TextProps & {variant?:TypeStyle;language?:string}) {
 const {i18n}=useTranslation();
 const {colors}=useTheme();
 const {systemScale,...font}=useTypography(variant,language??i18n.language);
 return <Text {...props} {...font} style={[font.style,{color:colors.textPrimary},style]} />;
}
