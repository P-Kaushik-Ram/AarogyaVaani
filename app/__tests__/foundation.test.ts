import fs from 'node:fs';
import path from 'node:path';
import { colors,typography,metrics,combinedTextScale } from '../src/design';
import { dark } from '../src/design/themes/dark';
import { highContrast } from '../src/design/themes/highContrast';
import { languages } from '../config/languages';
import en from '../src/i18n/locales/en.json';
const codes=['en','hi','ta','ml','kn','te'];
const placeholders=(s:string)=>[...s.matchAll(/{{(\w+)}}/g)].map(m=>m[1]).sort();
describe('Translation contracts',()=>{
 test.each(codes)('%s contains every key, content and interpolation parameter',code=>{
  const locale=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/i18n/locales',code+'.json'),'utf8'));
  expect(Object.keys(locale).sort()).toEqual(Object.keys(en).sort());
  for(const key of Object.keys(en) as (keyof typeof en)[]){expect(locale[key].trim()).not.toBe('');expect(placeholders(locale[key])).toEqual(placeholders(en[key]));}
 });
 test('Safety boundaries and scope notices are present in every language',()=>{
  for(const code of codes){const locale=require('../src/i18n/locales/'+code+'.json');for(const key of ['care.title','care.body','about.safety','phase.notice','phase.unavailable','medicine.deleteBody'])expect(locale[key].length).toBeGreaterThan(5);}
 });
});
describe('Language readiness and fonts',()=>{
 test('all six scripts, India locales and Unicode blocks are distinct',()=>{
  expect(languages.map(l=>l.code)).toEqual(codes);expect(new Set(languages.map(l=>l.script)).size).toBe(6);
  for(const l of languages){expect(l.speechLocale).toBe(`${l.code}-IN`);expect(l.ttsLocale).toBe(l.speechLocale);expect(l.unicodeRange[1]).toBeGreaterThan(l.unicodeRange[0]);}
 });
 test.each(languages)('$code makes no unverified understanding or voice claim',l=>{expect(l.readinessUi).toBe('ai-draft');expect(l.readinessUnderstanding).toBe(false);expect(l.readinessVoice).toBe(false);expect(l.lineHeightMultiplier).toBeGreaterThanOrEqual(1);});
 test('18 local font files referenced by the config plugin exist with matching family aliases',()=>{
  const app=require('../app.json').expo;
  const plugin=app.plugins.find((p:unknown[])=>Array.isArray(p)&&p[0]==='expo-font');
  expect(plugin[1].fonts).toHaveLength(18);
  for(const l of languages)for(const family of Object.values(l.fontFamily)) expect(fs.existsSync(path.join(__dirname,'../assets/fonts',family+'.ttf'))).toBe(true);
  for(const file of plugin[1].fonts)expect(fs.statSync(path.join(__dirname,'..',file)).size).toBeGreaterThan(1000);
 });
});
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('P4 glass design and accessibility contracts',()=>{
 test('brand tokens retain compact typography and accessible target sizes',()=>{expect(colors.dark.bg).toBe('#071A2B');expect(colors.dark.accent).toBe('#FF9F1C');expect(colors.dark.textPrimary).toBe('#FFF8EC');expect(colors.hc.bg).toBe('#02111E');expect(colors.hc.accent).toBe('#FFCF85');expect(highContrast.borderWidth).toBe(3);expect(dark.borderWidth).toBe(1);expect(typography.TimeDisplay).toEqual({fontSize:26,lineHeight:36,fontWeight:'700'});expect(typography.Body).toEqual({fontSize:15,lineHeight:24,fontWeight:'400'});expect(metrics.size.button).toBe(48);expect(metrics.size.touch).toBe(48);});
 test.each(['dark','hc'] as const)('%s meets measured text and boundary contrast targets',name=>{
  const palette=colors[name];for(const surface of ['bg','surface1','surface2'] as const){for(const text of ['textPrimary','textSecondary'] as const)expect(contrast(palette[text],palette[surface])).toBeGreaterThanOrEqual(7);expect(contrast(palette.borderStrong,palette[surface])).toBeGreaterThanOrEqual(3);}
  expect(contrast(palette.accent,palette.onAccent)).toBeGreaterThanOrEqual(7);
 });
 test('glass text retains 7:1 contrast at every light endpoint over the brightest ambient background',()=>{
  const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(v=>parseInt(v,16));
  const blend=(front:number[],back:number[],alpha:number)=>front.map((v,i)=>Math.round(v*alpha+back[i]*(1-alpha)));
  const hex=(value:number[])=>'#'+value.map(v=>v.toString(16).padStart(2,'0')).join('');
  const ambient=blend(rgb(colors.dark.amber),rgb(colors.dark.bg),.18);
  for(const [surface,alpha] of [['surface1',.94],['surface2',.96]] as const){
   const base=blend(rgb(colors.dark[surface]),ambient,alpha);
   for(const lit of [base,blend([255,255,255],base,.09),blend(rgb(colors.dark.amber),base,.15)]){
    for(const text of ['textPrimary','textSecondary'] as const)expect(contrast(colors.dark[text],hex(lit))).toBeGreaterThanOrEqual(7);
   }
  }
 });
 test.each([1,1.25,1.5])('caps combined accessibility scale at 200%% for in-app scale %s',appScale=>{for(const system of [1,1.3,1.5,2,3])expect(combinedTextScale(appScale,system)).toBe(Math.min(appScale*system,2));});
});
describe('Build and route boundaries',()=>{
 test('new project identity, CNG, permissions and development/preview profiles',()=>{
  const app=require('../app.json').expo,eas=require('../eas.json');expect(app.owner).toBeUndefined();expect(app.extra?.eas).toBeUndefined();expect(eas.build.preview.env?.EXPO_PUBLIC_API_URL).toBeUndefined();expect(app.slug).toBe('aarogyavaani');expect(app.android.package).toBe('com.kaushikram.aarogyavaani');
  const permissions=app.android.permissions.map((value:string)=>value.replace(/^android\.permission\./,''));expect(permissions).toEqual(expect.arrayContaining(['POST_NOTIFICATIONS','SCHEDULE_EXACT_ALARM','RECEIVE_BOOT_COMPLETED','RECORD_AUDIO','VIBRATE']));expect(permissions).not.toContain('USE_EXACT_ALARM');expect(new Set(permissions).size).toBe(permissions.length);expect(eas.build.development.developmentClient).toBe(true);expect(eas.build.preview.developmentClient).toBe(false);expect(eas.build.development.android.buildType).toBe('apk');
  const ignore=fs.readFileSync(path.join(__dirname,'../.gitignore'),'utf8');for(const item of ['/android','/ios','/node_modules','.env','.env.*','!.env.example'])expect(ignore.split(/\r?\n/)).toContain(item);
 });
 test('all required routes exist and development gallery has two release guards',()=>{
  const routes=['index','_layout','(onboarding)/language','(onboarding)/welcome','(onboarding)/permissions','(tabs)/today','(tabs)/talk','(tabs)/medicines','reminder/[id]','reminder/new','alert/[reminderId]','help','settings/index','settings/language-voice','settings/text-theme','settings/notification-health','settings/privacy','settings/advanced','settings/about','dev/gallery'];
  for(const route of routes)expect(fs.existsSync(path.join(__dirname,'../app',route+'.tsx'))).toBe(true);
  expect(fs.readFileSync(path.join(__dirname,'../app/_layout.tsx'),'utf8')).toContain('guard={__DEV__}');expect(fs.readFileSync(path.join(__dirname,'../app/dev/gallery.tsx'),'utf8')).toContain('if(!__DEV__)');
 });
 test('P3 scheduling and P5 speech capture are isolated; direct fetch remains forbidden',()=>{
  function walk(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  const files=walk(path.join(__dirname,'../src')).filter(f=>/\.tsx?$/.test(f));
  const source=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
  expect(source).not.toMatch(/\bfetch\s*\(/);
  const captures=files.filter(f=>/native\.start\s*\(/.test(fs.readFileSync(f,'utf8')));
  expect(captures.map(f=>path.relative(path.join(__dirname,'../src'),f).replaceAll('\\','/'))).toEqual(['features/voice/native.ts']);
  const voice=files.filter(f=>f.includes(path.join('features','voice'))).map(f=>fs.readFileSync(f,'utf8')).join('\n');
  expect(voice).not.toMatch(/saveConfirmed|cancelConfirmed|scheduleNotificationAsync|services\/api|notifications\/service/);
  const callers=files.filter(f=>/scheduleNotificationAsync\s*\(/.test(fs.readFileSync(f,'utf8')));
  expect(callers.map(f=>path.relative(path.join(__dirname,'../src'),f).replaceAll('\\','/'))).toEqual(['features/notifications/service.ts']);
 });
});
