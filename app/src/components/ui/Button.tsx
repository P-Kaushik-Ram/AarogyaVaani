import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { AppText } from './Text';
import { Sheet } from './Sheet';
type Props={label:string;onPress:()=>void;disabled?:boolean;selected?:boolean};
function Button({label,onPress,disabled,selected,kind='primary'}:Props & {kind?:'primary'|'secondary'|'danger'}) {
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);
 const textColor=disabled?colors.textSecondary:kind==='primary'?colors.onAccent:kind==='danger'?colors.danger:colors.textPrimary;
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,kind==='primary'&&s.shadow,kind==='secondary'&&s.secondary,kind==='danger'&&s.danger,selected&&s.selected,disabled&&s.disabledButton,pressed&&{backgroundColor:kind==='primary'?colors.accentPressed:colors.surface2}]}><AppText variant="Button" style={[s.buttonLabel,{color:textColor}]}>{label}</AppText></Pressable>;
}
export const PrimaryButton=(p:Props)=><Button {...p}/>;
export const SecondaryButton=(p:Props)=><Button {...p} kind="secondary"/>;
export function TextButton({label,onPress,disabled}:Props){const {colors}=useTheme(),s=createStyles(colors);return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} style={s.textButton} onPress={onPress}><AppText variant="Button" style={[s.underline,{color:colors.accent}]}>{label}</AppText></Pressable>;}
export function DestructiveButton({label,title,body,onConfirm,disabled}:{label:string;title:string;body:string;onConfirm:()=>void;disabled?:boolean}) {
 const [open,setOpen]=useState(false);const {t}=useTranslation();
 return <><Button label={label} kind="danger" disabled={disabled} onPress={()=>setOpen(true)}/><Sheet visible={open} title={title} onClose={()=>setOpen(false)}><AppText>{body}</AppText><Button label={label} kind="danger" onPress={()=>{setOpen(false);onConfirm();}}/><SecondaryButton label={t('action.cancel')} onPress={()=>setOpen(false)}/></Sheet></>;
}
