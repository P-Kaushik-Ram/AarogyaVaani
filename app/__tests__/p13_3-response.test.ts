jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
import i18n,{resources} from '../src/i18n';
import {languages} from '../config/languages';
import {analysisResponse,localizedResponse} from '../src/features/chat/feedbackText';
import type {Analysis} from '../src/services/api/models';
const analysis:Analysis={detected_language:'en',intent:'add_reminder',confidence:.9,safety:{triggered:false,reason:null},draft:{medicine:'PrivateBrand',times:['08:00'],days_of_week:'daily',note:null},missing:[],candidates:{},matches:[],reply:{language:'en',text:'English backend summary'}};

test.each(languages)('$code single displayed/spoken response is localized despite English backend and global language',async language=>{
 await i18n.changeLanguage('en');
 const response=analysisResponse(analysis,language.code)!;
 expect(response.speakable).toBe(true);expect(response.language).toBe(language.code);
 expect(response.text).toBe(i18n.getFixedT(language.code)('p11.confirm',{medicine:'PrivateBrand',times:'08:00',repeat:i18n.getFixedT(language.code)('medicine.daily')}));
 expect(response.text).not.toContain('English backend summary');
 for(const key of ['p11.saved','p11.saveFailed','p11.saveUncertain','p11.checkFailed','p11.clarify','p11.missingTime'] as const)expect(localizedResponse(language.code,key).speakable).toBe(true);
 expect(language.ttsLocale).toBe(language.code+'-IN');
});

test.each(['ml','kn','te','ta','hi'] as const)('%s English fallback template cannot be spoken as localized speech',language=>{
 const catalog=resources[language].translation,original=catalog['p11.confirm'];
 try{catalog['p11.confirm']=resources.en.translation['p11.confirm'];const response=analysisResponse(analysis,language)!;expect(response.speakable).toBe(false);expect(response.text).not.toContain('PrivateBrand');}
 finally{catalog['p11.confirm']=original;}
});

test('unknown locale and safety refusal cannot create localized reminder speech',()=>{
 expect(localizedResponse('unknown','p11.saved').speakable).toBe(false);
 expect(analysisResponse({...analysis,safety:{triggered:true,reason:'safety'}},'ml')).toBeUndefined();
});
