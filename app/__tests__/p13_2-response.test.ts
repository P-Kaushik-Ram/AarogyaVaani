import { languages } from '../config/languages';
import { analysisFeedback,analysisMessage } from '../src/features/chat/feedbackText';
import type { Analysis } from '../src/services/api/models';
import { createInstance } from 'i18next';
const en=require('../src/i18n/locales/en.json');
const analysis:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:'CaseSensitive Ω B12',times:['20:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{language:'en',text:'English server reply'}};

test.each(languages)('$code localized feedback preserves exact medicine, selected language and manual confirmation',async language=>{
 const instance=createInstance();const catalog=require('../src/i18n/locales/'+language.code+'.json');
 await instance.init({lng:language.code,fallbackLng:false,keySeparator:false,resources:{[language.code]:{translation:catalog}},interpolation:{escapeValue:false}});
 const t=instance.getFixedT(language.code),text=analysisFeedback(analysis,t)!;
 expect(text).toContain('CaseSensitive Ω B12');expect(text).toContain('20:00');
 expect(text).toBe(t('p11.confirm',{medicine:'CaseSensitive Ω B12',times:'20:00',repeat:t('medicine.daily')}));
 if(language.code!=='en')for(const key of ['p11.confirm','p11.saved','p11.saveFailed','p11.saveUncertain','p11.checkFailed','p11.clarify','p11.missingTime','p11.localVoice','p11.error','p132.voiceHelp']){
  expect(catalog[key]).not.toBe(en[key]);expect([...catalog[key]].some(char=>{const code=char.codePointAt(0)!;return code>=language.unicodeRange[0]&&code<=language.unicodeRange[1];})).toBe(true);
 }
 expect(analysisFeedback({...analysis,missing:['time']},t)).toBe(t('p11.missingTime'));
 expect(analysisFeedback({...analysis,missing:['medicine']},t)).toBe(t('p11.clarify'));
 expect(analysisFeedback({...analysis,safety:{triggered:true,reason:'phrase'}},t)).toBeUndefined();
 if(language.code!=='en')expect(analysisMessage(analysis,t,language.code)).not.toContain('English server reply');
 expect(analysisMessage({...analysis,reply:{language:language.code,text:'localized server fixture'}},t,language.code)).toBe('localized server fixture');
});
