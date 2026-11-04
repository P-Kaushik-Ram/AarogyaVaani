// JS timings start after Metro has delivered the bundle. They cannot measure
// native launch, bundle download, or the phone's first painted frame.
type Measurement={stage:string;elapsedMs:number;durationMs?:number};
const origin=__DEV__?performance.now():0;
const measurements:Measurement[]=[];
const seen=new Set<string>();
export function markStartup(stage:string,durationMs?:number){
 if(!__DEV__||seen.has(stage))return;
 seen.add(stage);
 const value={stage,elapsedMs:Math.round((performance.now()-origin)*10)/10,...(durationMs===undefined?{}:{durationMs:Math.round(durationMs*10)/10})};
 measurements.push(value);
 console.info('[startup]',JSON.stringify(value));
}
export function startupSpan(stage:string){
 if(!__DEV__)return (_result?:'done'|'error')=>{};
 const start=performance.now();markStartup(`${stage}.start`);
 return (result:'done'|'error'='done')=>markStartup(`${stage}.${result}`,performance.now()-start);
}
export const getStartupMeasurements=()=>__DEV__?measurements.map(value=>({...value})):[];
