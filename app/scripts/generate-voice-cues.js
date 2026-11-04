// Original, deterministic UI cues: mono PCM, tapered sine tones, no speech.
const fs=require('node:fs'),path=require('node:path');
const directory=path.join(__dirname,'../assets/audio');fs.mkdirSync(directory,{recursive:true});
for(const [name,hz,amplitude] of [['listen',660,.22],['complete',440,.16]]){
 const rate=24000,toneSeconds=.1,tailSeconds=.18,count=Math.round(rate*(toneSeconds+tailSeconds));
 const data=Buffer.alloc(44+count*2);
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*2,40);
 for(let i=0;i<rate*toneSeconds;i++){
  const t=i/rate,envelope=Math.sin(Math.PI*t/toneSeconds)**2;
  data.writeInt16LE(Math.round(32767*amplitude*envelope*Math.sin(2*Math.PI*hz*t)),44+i*2);
 }
 const target=path.join(directory,name+'.wav');fs.writeFileSync(target,data);
 console.log(`${name}.wav: ${count} samples, ${data.length} bytes, 100ms tone + 180ms silence`);
}
