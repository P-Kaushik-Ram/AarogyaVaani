import { create } from 'zustand';
import i18n, { defaultLanguage } from '../i18n';
import { languages, LanguageCode } from '../../config/languages';
import { ThemeName, TextSize } from '../design';
import { readPreferences, writePreferences } from '../services/storage/preferences';
import { startupSpan } from '../startup/timing';
type Values={language:LanguageCode;theme:ThemeName;textSize:TextSize;onboarded:boolean;reduceMotion:boolean;serverAddress:string;voiceResponses:boolean;reminderSound:boolean;reminderVibration:boolean};
const defaults:Values={language:defaultLanguage,theme:'dark',textSize:'standard',onboarded:false,reduceMotion:false,serverAddress:'',voiceResponses:false,reminderSound:true,reminderVibration:true};
type Store=Values & {ready:boolean;storageError:boolean;patch:(values:Partial<Values>)=>void;reset:()=>Promise<void>};
let writes=Promise.resolve();
export const usePreferences=create<Store>((set,get)=>({
  ...defaults,ready:false,storageError:false,
  patch(values){
    set(values);
    if(values.language)void i18n.changeLanguage(values.language);
    const {language,theme,textSize,onboarded,reduceMotion,serverAddress,voiceResponses,reminderSound,reminderVibration}=get();
    const snapshot={language,theme,textSize,onboarded,reduceMotion,serverAddress,voiceResponses,reminderSound,reminderVibration};
    writes=writes.catch(()=>{}).then(()=>writePreferences(snapshot)).then(()=>set({storageError:false}),()=>set({storageError:true}));
  },
  async reset(){await writes;await writePreferences(defaults);set({...defaults,storageError:false});await i18n.changeLanguage(defaults.language);},
}));
let hydration:Promise<void>|undefined;
export function hydratePreferences(){return hydration??=hydrate();}
async function hydrate(){
  const finish=startupSpan('preferences');
  try {
    const raw=await readPreferences();
    if(raw && typeof raw==='object') {
      const v=raw as Partial<Values>;
      const valid:Partial<Values>={};
      if(languages.some(l=>l.code===v.language))valid.language=v.language;
      if(v.theme==='dark'||v.theme==='hc')valid.theme=v.theme;
      if(v.textSize==='standard'||v.textSize==='large'||v.textSize==='extraLarge')valid.textSize=v.textSize;
      if(typeof v.onboarded==='boolean')valid.onboarded=v.onboarded;
      if(typeof v.reduceMotion==='boolean')valid.reduceMotion=v.reduceMotion;
      if(typeof v.voiceResponses==='boolean')valid.voiceResponses=v.voiceResponses;
      if(typeof v.reminderSound==='boolean')valid.reminderSound=v.reminderSound;
      if(typeof v.reminderVibration==='boolean')valid.reminderVibration=v.reminderVibration;
      if(typeof v.serverAddress==='string')valid.serverAddress=v.serverAddress;
      usePreferences.setState(valid);
    }
    const localized=startupSpan('localization');
    await i18n.changeLanguage(usePreferences.getState().language);localized();
    finish();
  } catch {finish('error');usePreferences.setState({storageError:true});}
  finally {usePreferences.setState({ready:true});}
}
