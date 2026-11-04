import { useWindowDimensions, TextStyle } from 'react-native';
import { getLanguage } from '../../config/languages';
import { metrics, typography, TypeStyle } from '.';
import { useTheme } from './ThemeProvider';
export function useTypography(variant:TypeStyle,language:string) {
 const {fontScale}=useWindowDimensions();
 const {textSize}=useTheme();
 const info=getLanguage(language), spec=typography[variant], scale=metrics.a11y.textScales[textSize];
 const family=spec.fontWeight==='700'?info.fontFamily.bold:spec.fontWeight==='600'?info.fontFamily.semibold:info.fontFamily.regular;
 const style:TextStyle={fontSize:spec.fontSize*scale,lineHeight:Math.ceil(spec.lineHeight*scale*info.lineHeightMultiplier),fontFamily:family,fontWeight:spec.fontWeight==='500'?'500':'normal',includeFontPadding:true,flexShrink:1,fontVariant:variant==='TimeDisplay'||variant==='TimelineTime'?['tabular-nums']:undefined};
 return {style,allowFontScaling:true,maxFontSizeMultiplier:metrics.a11y.maxCombinedScale/scale,systemScale:fontScale};
}
