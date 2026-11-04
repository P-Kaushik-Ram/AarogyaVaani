import fs from 'node:fs';
import path from 'node:path';
test('development timestamps record durations once; release records and logs nothing',()=>{
 const runtime=global as typeof global & {__DEV__:boolean};
 const previous=runtime.__DEV__;
 const log=jest.spyOn(console,'info').mockImplementation(()=>{});
 try{
  jest.isolateModules(()=>{
   runtime.__DEV__=true;const {markStartup,startupSpan,getStartupMeasurements}=require('../src/startup/timing');
   markStartup('js-entry');markStartup('js-entry');startupSpan('fixture')();
   const values=getStartupMeasurements();expect(values.map((v:any)=>v.stage)).toEqual(['js-entry','fixture.start','fixture.done']);
   expect(values[2].durationMs).toBeGreaterThanOrEqual(0);expect(log).toHaveBeenCalledTimes(3);
  });
  log.mockClear();jest.isolateModules(()=>{
   runtime.__DEV__=false;const {markStartup,startupSpan,getStartupMeasurements}=require('../src/startup/timing');
   markStartup('js-entry');startupSpan('fixture')();expect(getStartupMeasurements()).toEqual([]);expect(log).not.toHaveBeenCalled();
  });
 }finally{runtime.__DEV__=previous;log.mockRestore();}
});
test('application icon imports cannot reintroduce the full library into the startup bundle',()=>{
 const root=path.join(__dirname,'..');
 function files(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const file of [...files(path.join(root,'src')),...files(path.join(root,'app'))].filter(f=>/\.tsx?$/.test(f))){
  const imports=fs.readFileSync(file,'utf8').match(/^import .* from ['"]phosphor-react-native['"];?$/gm)??[];
  expect(imports.every(line=>line.startsWith('import type '))).toBe(true);
 }
});
