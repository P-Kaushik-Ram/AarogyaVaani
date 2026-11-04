import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { renderAsync,screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { LinearGradient,RadialGradient,Stop } from 'react-native-svg';
// Execute the installed extractor at runtime without type-checking its unpublished
// source against this project's newer React types.
const extractGradient:(props:any,parent:unknown)=>{gradient:number[]}=require('react-native-svg/src/lib/extract/extractGradient').default;
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { GlassCard,GlassLight } from '../src/components/ui/Glass';
import { PrimaryButton,SecondaryButton } from '../src/components/ui/Button';
import { IconButton } from '../src/components/ui/IconButton';
import { BottomTabBar,TabButton } from '../src/components/ui/BottomTabBar';
import { colors,metrics } from '../src/design';

beforeEach(()=>{jest.replaceProperty(Platform,'OS','android');jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(()=>jest.restoreAllMocks());
async function page(children:React.ReactNode,theme:'dark'|'hc'='dark'){
 return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider theme={theme} textSize="extraLarge">{children}</ThemeProvider></I18nextProvider>);
}
test('installed Android SVG extractor reproduces why P4 rgba stops became opaque white',()=>{
 const native=extractGradient({id:'p4-bug',children:[<Stop key="a" offset="0%" stopColor="rgba(255,255,255,0.09)"/>,<Stop key="b" offset="100%" stopColor="rgba(255,255,255,0)"/>]},null)!;
 const packed=native.gradient.filter((_,i)=>i%2===1);
 expect(packed.map(color=>color>>>24)).toEqual([255,255]);
 expect(packed.map(color=>color&0xffffff)).toEqual([0xffffff,0xffffff]);
});
test('repaired surface gradients use dark RGB and explicit native stop opacity',async()=>{
 await page(<GlassCard testID="card"/>);
 const gradient=screen.UNSAFE_getByType(LinearGradient);
 const stops=React.Children.toArray(gradient.props.children) as React.ReactElement<any>[];
 for(const stop of stops){expect(stop.props.stopColor).toMatch(/^#[0-9a-f]{6}$/i);expect(typeof stop.props.stopOpacity).toBe('number');}
 const native=extractGradient(gradient.props,null)!;
 for(let i=1;i<native.gradient.length;i+=2){
  const packed=native.gradient[i];expect(packed>>>24).toBeLessThan(128);
  expect(Math.max((packed>>>16)&255,(packed>>>8)&255,packed&255)).toBeLessThan(64);
 }
 expect(StyleSheet.flatten(screen.getByTestId('card').props.style).backgroundColor).toBe(colors.dark.glass);
});
test('actual extracted gradient alpha composites to dark glass with readable text',async()=>{
 await page(<GlassCard/>);
 const native=extractGradient(screen.UNSAFE_getByType(LinearGradient).props,null);
 const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(v=>parseInt(v,16));
 const blend=(front:number[],back:number[],alpha:number)=>front.map((v,i)=>v*alpha+back[i]*(1-alpha));
 const luminance=(color:number[])=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 const backdrop=blend(rgb(colors.dark.amber),rgb(colors.dark.bg),metrics.glass.ambientOpacity);
 const rgba=colors.dark.glass.match(/[\d.]+/g)!.map(Number);
 const base=blend(rgba.slice(0,3),backdrop,rgba[3]);
 for(let i=1;i<native.gradient.length;i+=2){
  const packed=native.gradient[i],lit=blend([(packed>>>16)&255,(packed>>>8)&255,packed&255],base,(packed>>>24)/255);
  expect(Math.max(...lit)).toBeLessThan(64);
  for(const text of [colors.dark.textPrimary,colors.dark.textSecondary])expect((luminance(rgb(text))+.05)/(luminance(lit)+.05)).toBeGreaterThanOrEqual(7);
 }
});
test('ambient light has bounded opacity; high contrast has no SVG gradient',async()=>{
 const view=await page(<GlassLight ambient/>);
 const native=extractGradient(screen.UNSAFE_getByType(RadialGradient).props,null)!;
 expect(native.gradient[1]>>>24).toBeLessThanOrEqual(26);expect(native.gradient[3]>>>24).toBe(0);
 await view.unmountAsync();await page(<GlassCard testID="hc"/>,'hc');
 expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();expect(screen.UNSAFE_queryByType(RadialGradient)).toBeNull();
 expect(StyleSheet.flatten(screen.getByTestId('hc').props.style).backgroundColor).toBe(colors.hc.surface1);
});
test.each(['en','hi','ta','ml','kn','te'])('%s primary/secondary labels wrap and cannot shrink vertically, in both themes',async language=>{
 await i18n.changeLanguage(language);
 for(const theme of ['dark','hc'] as const){
  const label=i18n.t('p4.addReminder')+' — '+i18n.t('p4.typeHint');
  const view=await page(<><PrimaryButton label={label} onPress={jest.fn()}/><SecondaryButton label={i18n.t('p2.refresh')} onPress={jest.fn()}/></>,theme);
  for(const [name,foreground] of [[label,colors[theme].onAccent],[i18n.t('p2.refresh'),colors[theme].textPrimary]]){
   const button=screen.getByRole('button',{name});const text=screen.getByText(name);
   expect(StyleSheet.flatten(button.props.style).flexShrink).toBe(0);
   expect(StyleSheet.flatten(text.props.style).flexShrink).toBe(0);expect(StyleSheet.flatten(text.props.style).color).toBe(foreground);
   expect(text.props.numberOfLines).toBeUndefined();expect(StyleSheet.flatten(text.props.style).height).toBeUndefined();
  }
  expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();await view.unmountAsync();
 }
});
test('header settings glyph is visually small inside an accessible target; navigation has no bright gradient',async()=>{
 await i18n.changeLanguage('en');
 const view=await page(<IconButton compact icon={GearSixIcon} label={i18n.t('settings.title')} onPress={jest.fn()}/>);
 expect(screen.UNSAFE_getByType(GearSixIcon).props.size).toBeLessThanOrEqual(20);
 const target=StyleSheet.flatten(screen.getByRole('button',{name:i18n.t('settings.title')}).props.style);
 expect(target.minWidth).toBeGreaterThanOrEqual(48);expect(target.minHeight).toBeGreaterThanOrEqual(48);
 await view.unmountAsync();await page(<BottomTabBar><TabButton label={i18n.t('tab.today')} icon={HouseIcon} isFocused/></BottomTabBar>);
 expect(screen.UNSAFE_queryByType(LinearGradient)).toBeNull();
 expect(metrics.size.tabBar).toBeLessThanOrEqual(56);
});
test.each(['dark','hc'] as const)('%s disabled actions stay legible without a faded whole-button opacity',async theme=>{
 const action=jest.fn();await page(<PrimaryButton label={i18n.t('talk.send')} disabled onPress={action}/>,theme);
 const button=screen.getByRole('button',{name:i18n.t('talk.send')});
 expect(button).toBeDisabled();expect(StyleSheet.flatten(button.props.style).opacity??1).toBe(1);
 expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(colors[theme].surface2);
 expect(StyleSheet.flatten(screen.getByText(i18n.t('talk.send')).props.style).color).toBe(colors[theme].textSecondary);
});
