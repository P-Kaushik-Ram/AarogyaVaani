// Opt-in: real review API, in-memory SecureStore, temporary SQLite and fake alarms.
// No ADB, physical device, backend configuration or production DB access.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../src/startup/timing',()=>({startupSpan:()=>()=>{}}));
jest.mock('expo-sqlite',()=>{
 const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const root=path.resolve(os.tmpdir()),folder=fs.mkdtempSync(path.join(root,'av-p15-cloud-')),connections:any[]=[];
 return {cleanup:()=>{connections.forEach(db=>db.close());if(path.dirname(folder)!==root||!path.basename(folder).startsWith('av-p15-cloud-'))throw new Error('fixture path');fs.rmSync(folder,{recursive:true});},openDatabaseAsync:async()=>{
  const db=new DatabaseSync(path.join(folder,'synthetic.db'));connections.push(db);
  return {execAsync:async(sql:string)=>db.exec(sql),runAsync:async(sql:string,...args:any[])=>db.prepare(sql).run(...args),getFirstAsync:async(sql:string,...args:any[])=>db.prepare(sql).get(...args),getAllAsync:async(sql:string,...args:any[])=>db.prepare(sql).all(...args)};
 }};
});
import * as SecureStore from 'expo-secure-store';
import { getApi,assertAddressAllowed,trackingScope } from '../src/services/api/session';
import { usePreferences } from '../src/store/preferences';
import { approvedBackendCutover } from '../config/backendCutover';
import { languages } from '../config/languages';
import { Analysis,canConfirm } from '../src/services/api/models';
import { NotificationEngine,Driver,State } from '../src/features/notifications/engine';
import { scheduledDoses,progress } from '../src/features/tracking/doses';
import { readDoses,recordDose,snapshotDoses } from '../src/features/tracking/storage';

const base='https://review.example.test';
const live=process.env.AAROGYAVAANI_LIVE_REVIEW==='1'?test:test.skip;

live('fresh v4 client uses cloud for six-language drafts, creation, listing, isolated tracking and notification planning',async()=>{
 const evidence=path.join(__dirname,'../evidence/p15_1');fs.mkdirSync(evidence,{recursive:true});
 const original=global.fetch;let saved:string|null=null;const checks:Record<string,unknown>[]=[];
 (SecureStore.getItemAsync as jest.Mock).mockImplementation(async()=>saved);
 (SecureStore.setItemAsync as jest.Mock).mockImplementation(async(_key:string,value:string)=>{saved=value;});
 const transport=((url:string,options:RequestInit)=>new Promise<Response>((resolve,reject)=>{
  if(new URL(url).origin!==base)return reject(new Error('unapproved origin'));
  const start=Date.now();const req=https.request(url,{method:options.method,headers:options.headers as Record<string,string>},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>{
    checks.push({path:new URL(url).pathname.replace(/\/\d+(?=\/|$)/g,'/:id'),status:res.statusCode,ms:Date.now()-start});
    resolve({ok:res.statusCode!>=200&&res.statusCode!<300,status:res.statusCode,json:async()=>JSON.parse(body)} as Response);
   });
  });req.on('error',()=>reject(new Error('verified HTTPS transport failed')));
  options.signal?.addEventListener('abort',()=>req.destroy(new Error('deadline')),{once:true});
  if(options.body)req.write(String(options.body));req.end();
 })) as typeof fetch;
 global.fetch=transport;usePreferences.setState({serverAddress:base});
 const api=getApi(base);let registered=false,passed=false;
 try{
  expect(approvedBackendCutover).toBeNull();await assertAddressAllowed(base);
  expect((await api.health()).status).toBe('ok');
  expect(await api.list()).toEqual([]);registered=true;
  expect(JSON.parse(saved!)[base]).toBeTruthy();
  expect((await api.languages()).map(p=>p.code).sort()).toEqual(languages.map(l=>l.code).sort());
  const drafts:Analysis[]=[];
  for(const language of languages){
   const text=JSON.parse(fs.readFileSync(path.join(__dirname,`../src/i18n/locales/${language.code}.json`),'utf8'))['talk.example'];
   const analysis=await api.analyze(text,language.code);
   expect(analysis.intent).toBe('add_reminder');expect(canConfirm(analysis)).toBe(true);
   expect(analysis.detected_language).toBe(language.code);drafts.push(analysis);
   checks.push({language:language.code,example_understood:true});
  }
  let state:State={};const alarms=new Map<string,string>();
  const driver:Driver={read:async()=>state,write:async v=>{state=v;},permission:async()=>true,scheduled:async()=>[...alarms].map(([identifier,signature])=>({identifier,signature})),schedule:async(p,s)=>{alarms.set(p.identifier,s);},cancel:async id=>{alarms.delete(id);},signature:p=>JSON.stringify([p.medicine,p.time,p.timezone]),now:()=>Date.now(),health:()=>{}};
  const engine=new NotificationEngine(driver);
  const reminder=await engine.create(base,()=>api.create(drafts[0],true));
  expect(await api.list()).toEqual([reminder]);expect(alarms.size).toBeGreaterThan(0);
  const count=alarms.size;await engine.refresh(base,()=>api.list());expect(alarms.size).toBe(count);
  const scope=await trackingScope(base),doses=scheduledDoses([reminder],new Date());expect(doses.length).toBeGreaterThan(0);
  await snapshotDoses(scope,doses);await recordDose(scope,doses[0],'taken');
  expect(progress(await readDoses(scope)).taken).toBe(1);
  await recordDose(scope,doses[0],'skipped');expect((await readDoses(scope))[0].status).toBe('skipped');
  expect(await readDoses('separate-synthetic-scope')).toEqual([]);
  checks.push({fresh_identity:true,cloud_create_list:true,local_taken_skipped:true,mocked_alarm_count:alarms.size,reconcile_no_duplicates:true,bridge_disabled:true});
  const previous=saved;await expect(assertAddressAllowed('https://old.example')).rejects.toMatchObject({kind:'cutover'});expect(saved===previous).toBe(true);
  passed=true;
 }finally{
  try{if(registered||saved){await api.deleteMe(true);checks.push({new_synthetic_cloud_identity_cleaned:true});}}finally{
   global.fetch=original;require('expo-sqlite').cleanup();
   fs.writeFileSync(path.join(evidence,'live-client.json'),JSON.stringify({base,passed,physical_phone_touched:false,native_notifications:'mocked; no OS alarms',checks},null,2));
  }
 }
},120000);
