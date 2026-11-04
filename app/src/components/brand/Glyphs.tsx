import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { art } from '../../design/artwork';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
export function LampMark({size=metrics.size.glyph,color}:{size?:number;color?:string}){const {colors}=useTheme();return <Svg width={size} height={size} viewBox={art.viewBox} accessible={false}><Path d={art.lamp} fill={color??colors.accent}/></Svg>;}
export function MedicineGlyph({kind='tablet'}:{kind?:keyof typeof art.medicine}){const {colors}=useTheme();return <Svg width={metrics.size.glyph} height={metrics.size.glyph} viewBox={art.viewBox} accessible={false}><Path d={art.medicine[kind]} fill="none" stroke={colors.accent} strokeWidth={art.stroke} strokeLinecap="round" strokeLinejoin="round"/></Svg>;}
export function TimeGlyph({kind='night'}:{kind?:keyof typeof art.time}){const {colors}=useTheme();return <Svg width={metrics.size.icon} height={metrics.size.icon} viewBox={art.viewBox} accessible={false}><Path d={art.time[kind]} fill="none" stroke={colors.accent} strokeWidth={art.stroke} strokeLinecap="round" strokeLinejoin="round"/></Svg>;}
export function EmptyIllustration({kind='today'}:{kind?:'today'|'medicines'|'offline'}){const {colors}=useTheme();return <Svg width={metrics.size.illustration} height={metrics.size.illustration} viewBox={art.viewBox} accessible={false}><Path d={kind==='medicines'?art.medicine.capsule:art.lamp} fill="none" stroke={colors.accent} strokeWidth={art.stroke}/><Path d={kind==='offline'?art.cross:art.empty} fill="none" stroke={colors.accent} strokeWidth={art.stroke}/></Svg>;}
