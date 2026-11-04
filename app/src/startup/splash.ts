import * as SplashScreen from 'expo-splash-screen';
import { markStartup } from './timing';
let hidden=false;
export function revealContent(stage:'shell.layout'|'route.layout'){
 markStartup(stage);
 if(hidden)return;
 try{SplashScreen.hide();hidden=true;markStartup('splash.hide-requested');}
 catch{markStartup('splash.hide-error');}
}
