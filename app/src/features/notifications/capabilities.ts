import { Platform } from 'react-native';

// No native FSI adapter or reviewed Play declaration exists in this binary.
// OS version alone never establishes eligibility. Fail closed on every version.
export function fullScreenCapability(){
 return {supported:false as const,android:Platform.OS==='android',version:Number(Platform.Version),reason:'p12.fullScreenUnavailable' as const};
}
