import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Image, StyleSheet } from 'react-native';
import { renderAsync,screen,fireEvent,act } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({router:{push:jest.fn(),back:jest.fn(),replace:jest.fn(),canGoBack:jest.fn(()=>true)}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:false})}));
jest.mock('../src/services/storage/preferences',()=>({writePreferences:jest.fn()}));
import { router } from 'expo-router';
import i18n from '../src/i18n';
import { Screen } from '../src/components/ui/Screen';
import { AboutScreen } from '../src/features/settings/Screens';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { branding,brandStyles } from '../src/design/branding';
import { usePreferences } from '../src/store/preferences';
import { writePreferences } from '../src/services/storage/preferences';
const {PNG}=require('pngjs');
const config=require('../app.json').expo;
function page(children:React.ReactNode){return renderAsync(<I18nextProvider i18n={i18n}><ThemeProvider>{children}</ThemeProvider></I18nextProvider>);}
beforeEach(async()=>{jest.clearAllMocks();await i18n.changeLanguage('en');usePreferences.setState({language:'en',storageError:false,serverAddress:'https://fixture.example'});});

test.each(['en','hi','ta','ml','kn','te'])('%s header keeps one native app name, official symbol and localized navigation',async language=>{
 await i18n.changeLanguage(language);
 await page(<Screen titleKey="tab.talk" back={false} settings help>{null}</Screen>);
 const logo=screen.getByTestId('brand-symbol');
 expect(logo.props.source).toEqual(require('../assets/branding/aarogyavaani_app_icon.png'));
 expect(logo.props.resizeMode).toBe('contain');expect(screen.getAllByText(i18n.t('app.name'))).toHaveLength(1);
 expect(StyleSheet.flatten(logo.props.style)).toMatchObject({width:44,height:44,flexShrink:0});
 expect(screen.queryByTestId('official-logo')).toBeNull();
 expect(screen.getByRole('header',{name:i18n.t('p43.createReminder')})).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.title')})));
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('help.title')})));
 expect(router.push).toHaveBeenNthCalledWith(1,'/settings');expect(router.push).toHaveBeenNthCalledWith(2,'/help');
});

test('back control and fallback route survive the branding change',async()=>{
 await page(<Screen titleKey="settings.title">{null}</Screen>);
 const back=screen.getByRole('button',{name:i18n.t('action.back')});
 await act(async()=>fireEvent.press(back));expect(router.back).toHaveBeenCalledTimes(1);
 (router.canGoBack as jest.Mock).mockReturnValueOnce(false);
 await act(async()=>fireEvent.press(back));expect(router.replace).toHaveBeenCalledWith('/today');
 expect(screen.getByRole('header',{name:i18n.t('settings.title')})).toBeTruthy();
});

test('About has one responsive full logo, safety/privacy and unchanged five-tap server access',async()=>{
 await page(<AboutScreen/>);
 expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(1);
 expect(StyleSheet.flatten(screen.getByTestId('official-logo').props.style)).toMatchObject({maxWidth:360,aspectRatio:1149/526});
 expect(screen.getByText(i18n.t('about.safety'))).toBeTruthy();expect(screen.getByText(i18n.t('about.credits'))).toBeTruthy();
 await act(async()=>fireEvent.press(screen.getByRole('button',{name:i18n.t('settings.privacy')})));
 expect(router.push).toHaveBeenCalledWith('/settings/privacy');jest.clearAllMocks();
 const version=screen.getByRole('button',{name:i18n.t('settings.version',{version:'1.0.0'})});
 for(let i=0;i<4;i++)await act(async()=>fireEvent.press(version));
 expect(router.push).not.toHaveBeenCalled();await act(async()=>fireEvent.press(version));
 expect(router.push).toHaveBeenCalledTimes(1);expect(router.push).toHaveBeenCalledWith('/settings/advanced');
 expect(usePreferences.getState().serverAddress).toBe('https://fixture.example');expect(writePreferences).not.toHaveBeenCalled();
});

test.each([320,360,412,768])('About artwork constraints fit %ipx content; native header has no banner aspect ratio',width=>{
 const file=fs.readFileSync(path.join(__dirname,'../assets/branding/aarogyavaani_full_header.png'));
 expect(file.readUInt32BE(16)/file.readUInt32BE(20)).toBe(branding.aspectRatio);
 for(const style of [brandStyles.about]){
  const renderedWidth=Math.min(width-32,style.maxWidth);
  expect(renderedWidth).toBeLessThanOrEqual(width-32);expect(renderedWidth/style.aspectRatio).toBeLessThanOrEqual(202);
  expect(style).not.toHaveProperty('height');
 }
 expect(brandStyles.header).toMatchObject({minHeight:72,flexDirection:'row'});
 expect(brandStyles.header).not.toHaveProperty('aspectRatio');expect(brandStyles.header).not.toHaveProperty('height');
});

test('native config preserves package, advances release version and uses navy logo-only splash in both themes',()=>{
 expect(config.icon).toBe('./assets/branding/aarogyavaani_app_icon.png');
 expect(config.android.package).toBe('com.kaushikram.aarogyavaani');expect(config.android.versionCode).toBe(5);
 expect(config.android.adaptiveIcon).toEqual({foregroundImage:'./assets/branding/aarogyavaani_adaptive_foreground.png',backgroundColor:'#071A2B'});
 const splash=config.plugins.find((p:any)=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1];
 expect(splash).toEqual({image:config.icon,backgroundColor:'#071A2B',imageWidth:136,resizeMode:'contain',dark:{image:config.icon,backgroundColor:'#071A2B'}});
 expect(config.plugins.find((p:any)=>Array.isArray(p)&&p[0]==='expo-notifications')[1].icon).toBe('./assets/images/notification-icon.png');
});

test('adaptive foreground contains exact original pixels centered inside Android circular safe zone',()=>{
 const original=PNG.sync.read(fs.readFileSync(path.join(__dirname,'../assets/branding/aarogyavaani_app_icon.png')));
 const layer=PNG.sync.read(fs.readFileSync(path.join(__dirname,'../assets/branding/aarogyavaani_adaptive_foreground.png')));
 expect(original.width).toBe(1024);expect(original.height).toBe(1024);expect(layer.width).toBe(layer.height);
 const inset=(layer.width-original.width)/2;
 for(let y=0;y<layer.height;y++){
  if(y<inset||y>=inset+original.height){expect(layer.data.subarray(y*layer.width*4,(y+1)*layer.width*4).every((v:number)=>v===0)).toBe(true);continue;}
  expect(layer.data.subarray(y*layer.width*4,(y*layer.width+inset)*4).every((v:number)=>v===0)).toBe(true);
  expect(layer.data.subarray((y*layer.width+inset+original.width)*4,(y+1)*layer.width*4).every((v:number)=>v===0)).toBe(true);
  expect(layer.data.subarray((y*layer.width+inset)*4,(y*layer.width+inset+original.width)*4).equals(original.data.subarray((y-inset)*original.width*4,(y-inset+1)*original.width*4))).toBe(true);
 }
 expect(Math.hypot(original.width/2,original.height/2)).toBeLessThan(layer.width*33/108);
});
