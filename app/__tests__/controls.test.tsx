import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { renderAsync,screen,fireEvent,act } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/design/ThemeProvider';
import { PrimaryButton,DestructiveButton } from '../src/components/ui/Button';
import { LanguageList } from '../src/components/ui/LanguageList';
import { AppText } from '../src/components/ui/Text';
import { usePreferences } from '../src/store/preferences';
beforeEach(()=>{jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(()=>jest.restoreAllMocks());
function Wrapper({children}:{children:React.ReactNode}){return <I18nextProvider i18n={i18n}><ThemeProvider>{children}</ThemeProvider></I18nextProvider>;}
test('a disabled action cannot run',async()=>{const action=jest.fn();await renderAsync(<PrimaryButton label={i18n.t('action.save')} onPress={action} disabled/>,{wrapper:Wrapper});await fireEvent.press(screen.getByRole('button',{name:i18n.t('action.save')}));expect(action).not.toHaveBeenCalled();});
test('destructive action opens a sheet, cancel preserves data, explicit confirmation runs it',async()=>{
 const destroy=jest.fn(),label=i18n.t('action.delete'),title=i18n.t('medicine.deleteTitle',{medicine:i18n.t('gallery.sampleMedicine')});
 await renderAsync(<DestructiveButton label={label} title={title} body={i18n.t('medicine.deleteBody')} onConfirm={destroy}/>,{wrapper:Wrapper});
 await fireEvent.press(screen.getByRole('button',{name:label}));expect(destroy).not.toHaveBeenCalled();expect(screen.getByRole('header',{name:title})).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:i18n.t('action.cancel')}));expect(destroy).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:label}));
 const matches=screen.getAllByRole('button',{name:label});await fireEvent.press(matches[matches.length-1]);expect(destroy).toHaveBeenCalledTimes(1);
});
test('six language options expose selection and native names',async()=>{const change=jest.fn();await renderAsync(<LanguageList value="en" onChange={change}/>,{wrapper:Wrapper});const rows=screen.getAllByRole('radio');expect(rows).toHaveLength(6);await fireEvent.press(rows[3]);expect(change).toHaveBeenCalledWith('ml');});
test('switching language changes the font; large text retains a 200% system cap',async()=>{
 await renderAsync(<AppText>{i18n.t('settings.preview')}</AppText>,{wrapper:Wrapper});
 await act(async()=>{await i18n.changeLanguage('ta');usePreferences.setState({textSize:'extraLarge'});});
 const text=screen.getByText(i18n.t('settings.preview',{lng:'en'}));
 expect(text.props.maxFontSizeMultiplier).toBeCloseTo(2/1.5);
 const styles=Array.isArray(text.props.style)?text.props.style.flat():[text.props.style];expect(styles.some((s:any)=>s?.fontFamily==='NotoSansTamil_400Regular')).toBe(true);
 await act(async()=>{await i18n.changeLanguage('en');usePreferences.setState({textSize:'standard'});});
});
