import { CredentialStorage } from '../src/services/api/client';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
import * as SecureStore from 'expo-secure-store';
import { apiAddress,getApi } from '../src/services/api/session';
import { usePreferences } from '../src/store/preferences';
let stored:string|null;
beforeEach(()=>{stored=null;(SecureStore.getItemAsync as jest.Mock).mockImplementation(async()=>stored);(SecureStore.setItemAsync as jest.Mock).mockImplementation(async(_key:string,value:string)=>{stored=value;});});
test('setting wins environment and an empty setting uses public URL',()=>{const previous=process.env.EXPO_PUBLIC_API_URL;process.env.EXPO_PUBLIC_API_URL='https://environment.example';usePreferences.setState({serverAddress:'https://setting.example'});expect(apiAddress()).toBe('https://setting.example');usePreferences.setState({serverAddress:''});expect(apiAddress()).toBe('https://environment.example');if(previous===undefined)delete process.env.EXPO_PUBLIC_API_URL;else process.env.EXPO_PUBLIC_API_URL=previous;});
test('ordinary origin changes cannot register a replacement identity or forward its token',async()=>{
 const original=global.fetch;let sequence=0;const calls:{url:string;auth:string|undefined}[]=[];
 global.fetch=jest.fn(async(url:any,options:any)=>{calls.push({url,auth:options.headers.Authorization});return {ok:true,status:200,json:async()=>url.endsWith('/devices')?{user_id:'synthetic',token:'synthetic-token-'+(++sequence)}:[]};}) as any;
 try{
  await getApi('https://first-vault.example').list();
  await expect(getApi('https://second-vault.example').list()).rejects.toMatchObject({kind:'cutover'});
  await getApi('https://first-vault.example').list();expect(sequence).toBe(1);
  expect(calls.every(c=>new URL(c.url).origin==='https://first-vault.example')).toBe(true);
  expect(JSON.parse(stored!)['https://first-vault.example']).toBe('synthetic-token-1');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('aarogyavaani.devices.v1',expect.any(String),{keychainAccessible:6});
 }finally{global.fetch=original;}
});
test('corrupt secure storage is an error and does not register another identity',async()=>{stored='not JSON';const original=global.fetch;global.fetch=jest.fn();try{await expect(getApi('https://corrupt-vault.example').list()).rejects.toMatchObject({kind:'storage'});expect(global.fetch).not.toHaveBeenCalled();}finally{global.fetch=original;}});
