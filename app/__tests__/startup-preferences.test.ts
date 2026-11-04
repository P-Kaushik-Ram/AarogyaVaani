jest.mock('../src/i18n',()=>({__esModule:true,default:{changeLanguage:jest.fn().mockResolvedValue(undefined)},defaultLanguage:'en'}));
jest.mock('../src/services/storage/preferences',()=>({readPreferences:jest.fn(),writePreferences:jest.fn()}));
beforeEach(()=>jest.resetModules());
test('concurrent hydration shares one SQLite read and language initialization',async()=>{
 const {readPreferences}=require('../src/services/storage/preferences');
 let resolve!:(v:unknown)=>void;readPreferences.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const {hydratePreferences,usePreferences}=require('../src/store/preferences');
 const first=hydratePreferences(),second=hydratePreferences();expect(second).toBe(first);expect(readPreferences).toHaveBeenCalledTimes(1);
 resolve({language:'ta',onboarded:true});await first;await hydratePreferences();expect(readPreferences).toHaveBeenCalledTimes(1);expect(usePreferences.getState()).toMatchObject({ready:true,language:'ta',onboarded:true});
});
test('storage failure finishes initialization with an explicit error and safe defaults',async()=>{
 const {readPreferences}=require('../src/services/storage/preferences');readPreferences.mockRejectedValue(new Error('SQLite'));
 const {hydratePreferences,usePreferences}=require('../src/store/preferences');await expect(hydratePreferences()).resolves.toBeUndefined();expect(usePreferences.getState()).toMatchObject({ready:true,storageError:true,onboarded:false,language:'en'});
});

test.each([true,false,'invalid',undefined])('voice setting hydrates safely without changing legacy identity/settings: %s',async value=>{
 const {readPreferences}=require('../src/services/storage/preferences');readPreferences.mockResolvedValue({voiceResponses:value,language:'ta',serverAddress:'https://fixture.example',onboarded:true});
 const {hydratePreferences,usePreferences}=require('../src/store/preferences');await hydratePreferences();expect(usePreferences.getState()).toMatchObject({voiceResponses:typeof value==='boolean'?value:false,language:'ta',serverAddress:'https://fixture.example',onboarded:true});
});
test('voice setting persists through existing serialized preferences writes',async()=>{
 const {writePreferences,readPreferences}=require('../src/services/storage/preferences');readPreferences.mockResolvedValue(null);writePreferences.mockResolvedValue(undefined);const {hydratePreferences,usePreferences}=require('../src/store/preferences');await hydratePreferences();expect(usePreferences.getState().voiceResponses).toBe(false);usePreferences.getState().patch({voiceResponses:true});for(let i=0;i<10;i++)await Promise.resolve();expect(writePreferences).toHaveBeenLastCalledWith(expect.objectContaining({voiceResponses:true,serverAddress:''}));
});
