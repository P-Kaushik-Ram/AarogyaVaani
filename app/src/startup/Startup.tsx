import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { markStartup } from './timing';
import { revealContent } from './splash';

const Context=createContext({backgroundReady:true,routeLaidOut:()=>{}});
// First lay out a route, then yield a frame before starting native/network work.
export function StartupProvider({children}:{children:React.ReactNode}){
 const [backgroundReady,setReady]=useState(false),started=useRef(false),frames=useRef<number[]>([]);
 const routeLaidOut=useCallback(()=>{
  if(started.current)return;started.current=true;revealContent('route.layout');
  frames.current.push(requestAnimationFrame(()=>{frames.current.push(requestAnimationFrame(()=>{markStartup('background.enabled');setReady(true);}));}));
 },[]);
 useEffect(()=>()=>{frames.current.forEach(cancelAnimationFrame);started.current=false;},[]);
 return <Context.Provider value={{backgroundReady,routeLaidOut}}>{children}</Context.Provider>;
}
export const useStartup=()=>useContext(Context);
