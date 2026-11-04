jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../src/features/tracking/storage',()=>({clearDoses:jest.fn(async()=>{})}));
import * as SecureStore from 'expo-secure-store';
import { trackingScope,forgetDevice } from '../src/services/api/session';
import { clearDoses } from '../src/features/tracking/storage';
let stored:string;
beforeEach(()=>{
 stored=JSON.stringify({'https://one.example':'synthetic-secret-one','https://two.example':'synthetic-secret-two'});
 (SecureStore.getItemAsync as jest.Mock).mockImplementation(async()=>stored);
 (SecureStore.setItemAsync as jest.Mock).mockImplementation(async(_key:string,value:string)=>{stored=value;});
});
test('device scopes are opaque, distinct across origins, coalesced under concurrent requests and reused after JS restart',async()=>{
 const original=global.fetch;global.fetch=jest.fn();
 try{
  const [a,b,c]=await Promise.all([trackingScope('https://one.example'),trackingScope('https://one.example/'),trackingScope('https://two.example')]);
  expect(a).toBe(b);expect(a).not.toBe(c);expect(a).not.toContain('synthetic-secret');
  expect(JSON.parse(stored)['https://one.example']).toBe('synthetic-secret-one');
  let restarted!:typeof import('../src/services/api/session');jest.isolateModules(()=>{restarted=require('../src/services/api/session');});
  expect(await restarted.trackingScope('https://one.example')).toBe(a);expect(global.fetch).not.toHaveBeenCalled();
 }finally{global.fetch=original;}
});
test('no credentials means tracking fails closed without registering another server identity',async()=>{
 await expect(trackingScope('https://unknown.example')).rejects.toMatchObject({kind:'storage'});
});
test('forgetting an authenticated device erases its tracking before credentials and retains the other origin',async()=>{
 const scope=await trackingScope('https://two.example');
 // Each test resets the synthetic vault; include the persisted namespace for
 // this existing module's cached device, just as it exists on a real restart.
 stored=JSON.stringify({...JSON.parse(stored),'https://two.example.tracking':scope});
 await forgetDevice('https://two.example');expect(clearDoses).toHaveBeenCalledWith(scope);
 const values=JSON.parse(stored);expect(values['https://two.example']).toBeUndefined();expect(values['https://two.example.tracking']).toBeUndefined();expect(values['https://one.example']).toBe('synthetic-secret-one');
});
