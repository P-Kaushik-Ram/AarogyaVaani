export const languages = [
  {code:'en',nativeName:'English',englishName:'English',script:'Latin',speechLocale:'en-IN',ttsLocale:'en-IN',fontFamily:{regular:'NotoSans_400Regular',semibold:'NotoSans_600SemiBold',bold:'NotoSans_700Bold'},lineHeightMultiplier:1.00,unicodeRange:[0x0000,0x007f],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'launch'},
  {code:'hi',nativeName:'हिन्दी',englishName:'Hindi',script:'Devanagari',speechLocale:'hi-IN',ttsLocale:'hi-IN',fontFamily:{regular:'NotoSansDevanagari_400Regular',semibold:'NotoSansDevanagari_600SemiBold',bold:'NotoSansDevanagari_700Bold'},lineHeightMultiplier:1.08,unicodeRange:[0x0900,0x097f],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'launch'},
  {code:'ta',nativeName:'தமிழ்',englishName:'Tamil',script:'Tamil',speechLocale:'ta-IN',ttsLocale:'ta-IN',fontFamily:{regular:'NotoSansTamil_400Regular',semibold:'NotoSansTamil_600SemiBold',bold:'NotoSansTamil_700Bold'},lineHeightMultiplier:1.12,unicodeRange:[0x0b80,0x0bff],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'launch'},
  {code:'ml',nativeName:'മലയാളം',englishName:'Malayalam',script:'Malayalam',speechLocale:'ml-IN',ttsLocale:'ml-IN',fontFamily:{regular:'NotoSansMalayalam_400Regular',semibold:'NotoSansMalayalam_600SemiBold',bold:'NotoSansMalayalam_700Bold'},lineHeightMultiplier:1.15,unicodeRange:[0x0d00,0x0d7f],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'wave2'},
  {code:'kn',nativeName:'ಕನ್ನಡ',englishName:'Kannada',script:'Kannada',speechLocale:'kn-IN',ttsLocale:'kn-IN',fontFamily:{regular:'NotoSansKannada_400Regular',semibold:'NotoSansKannada_600SemiBold',bold:'NotoSansKannada_700Bold'},lineHeightMultiplier:1.12,unicodeRange:[0x0c80,0x0cff],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'wave2'},
  {code:'te',nativeName:'తెలుగు',englishName:'Telugu',script:'Telugu',speechLocale:'te-IN',ttsLocale:'te-IN',fontFamily:{regular:'NotoSansTelugu_400Regular',semibold:'NotoSansTelugu_600SemiBold',bold:'NotoSansTelugu_700Bold'},lineHeightMultiplier:1.12,unicodeRange:[0x0c00,0x0c7f],readinessUi:'ai-draft',readinessUnderstanding:false,readinessVoice:false,wave:'wave2'},
] as const;
export type LanguageCode = typeof languages[number]['code'];
export const getLanguage = (code: string) => languages.find(l => l.code === code) ?? languages[0];
// Attempt the selected locale only; provider availability is checked per session.
// Configuration is not native-speaker or physical-device verification.
export const voiceInputCodes = languages.map(language=>language.code);
export function voiceInputLocale(code:string){return voiceInputCodes.some(value=>value===code)?getLanguage(code).speechLocale:undefined;}
