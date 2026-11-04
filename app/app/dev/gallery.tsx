import React from 'react';
import { Redirect } from 'expo-router';
export default function GalleryRoute(){
 if(!__DEV__)return <Redirect href="/today"/>;
 const {Gallery}=require('../../src/features/dev/Gallery');
 return <Gallery/>;
}
