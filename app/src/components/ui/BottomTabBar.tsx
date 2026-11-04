import React, { forwardRef } from 'react';
import { View, ViewProps, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabTriggerSlotProps } from 'expo-router/ui';
import type { Icon } from 'phosphor-react-native';
import { AppText } from './Text';
import { metrics } from '../../design';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';
import { createStyles } from '../../design/layout';
import { useKeyboardVisible } from '../../design/useKeyboardVisible';
import { GlassEdge } from './Glass';
export const BottomTabBar=forwardRef<View,ViewProps>(function BottomTabBar({style,children,...props},ref){
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth),warm=stitchStyles(colors,borderWidth),insets=useSafeAreaInsets(),keyboard=useKeyboardVisible();
 return <StitchFoundation><View ref={ref} {...props} testID="navigation-footer" style={[s.navFooter,warm.footer,{paddingBottom:Math.max(insets.bottom,metrics.space.sm)},style,keyboard&&s.hidden]}><View style={[s.tabBar,warm.nav]}><GlassEdge/>{children}</View></View></StitchFoundation>;
});
export const TabButton=forwardRef<View,TabTriggerSlotProps & {label:string;icon:Icon}>(function TabButton({label,icon:Glyph,isFocused,...props},ref){const {colors,borderWidth,theme}=useTheme(),s=createStyles(colors,borderWidth),warm=stitchStyles(colors,borderWidth);return <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:isFocused}} style={[s.tab,warm.tab]}><View style={[warm.tabIcon,isFocused&&warm.activeIcon,isFocused&&theme==='hc'&&warm.activeIconHC]}><Glyph size={metrics.size.iconSmall} color={isFocused?(theme==='hc'?colors.onAccent:colors.accent):colors.textSecondary} weight={isFocused?'fill':'regular'}/></View><AppText variant="Nav" style={[s.navLabel,{color:isFocused?colors.accent:colors.textSecondary}]}>{label}</AppText></Pressable>;});
