import React, { useState, useId } from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from './Text';
import { useTypography } from '../../design/useTypography';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function TextField({label,compact=false,inputRef,...props}:TextInputProps & {label:string;compact?:boolean;inputRef?:React.Ref<TextInput>}) {const [focused,setFocused]=useState(false),id=useId(),{i18n}=useTranslation(),{colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);const {systemScale,...font}=useTypography('Body',i18n.language);return <View style={s.field}><AppText nativeID={id} variant={compact?'SectionLabel':'Body'}>{label}</AppText><TextInput ref={inputRef} {...props} accessibilityLabel={label} accessibilityLabelledBy={id} allowFontScaling={font.allowFontScaling} maxFontSizeMultiplier={font.maxFontSizeMultiplier} selectionColor={colors.accent} placeholderTextColor={colors.textMuted} onFocus={e=>{setFocused(true);props.onFocus?.(e);}} onBlur={e=>{setFocused(false);props.onBlur?.(e);}} style={[s.input,font.style,s.noShrink,focused&&s.focus,props.style]}/></View>;}
