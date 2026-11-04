import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { colors, metrics, ThemeName, TextSize } from '.';
import { usePreferences } from '../store/preferences';
const Context = createContext({colors:colors.dark,borderWidth:metrics.size.outline,reduceMotion:false,textSize:'standard' as TextSize,theme:'dark' as ThemeName});
export function ThemeProvider({children,theme:overrideTheme,textSize:overrideSize}:{children:React.ReactNode;theme?:ThemeName;textSize?:TextSize}) {
  const savedTheme = usePreferences(s=>s.theme);
  const savedSize = usePreferences(s=>s.textSize);
  const overrideMotion = usePreferences(s=>s.reduceMotion);
  const [systemReduced,setSystemReduced] = useState(false);
  useEffect(()=>{let alive=true; AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setSystemReduced(v);}).catch(()=>{if(alive)setSystemReduced(true);}); const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced); return()=>{alive=false;sub.remove();};},[]);
  const theme = overrideTheme ?? savedTheme;
  return <Context.Provider value={{colors:colors[theme],borderWidth:theme==='hc'?metrics.size.highContrastOutline:metrics.size.outline,reduceMotion:overrideMotion||systemReduced,textSize:overrideSize??savedSize,theme}}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);

// Compatibility boundary for existing screens; never override the app palette.
export function StitchFoundation({children}:{children:React.ReactNode}) {
 return <>{children}</>;
}
