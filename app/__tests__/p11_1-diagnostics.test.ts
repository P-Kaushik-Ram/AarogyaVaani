import { voiceDiagnostic } from '../src/features/voice/diagnostics';

test('voice diagnostics are development only',()=>{
 const log=jest.spyOn(console,'debug').mockImplementation(()=>{});
 const previous=__DEV__;
 try{
  (globalThis as unknown as {__DEV__:boolean}).__DEV__=false;
  voiceDiagnostic('native-error',{code:13,locale:'ta-IN'});expect(log).not.toHaveBeenCalled();
  (globalThis as unknown as {__DEV__:boolean}).__DEV__=true;
  voiceDiagnostic('native-error',{code:13,locale:'ta-IN'});
  expect(log).toHaveBeenCalledWith('[voice]','native-error',{code:13,locale:'ta-IN'});
 }finally{(globalThis as unknown as {__DEV__:boolean}).__DEV__=previous;log.mockRestore();}
});
