import { StyleSheet } from 'react-native';

// Only About uses the wide artwork. Daily navigation uses a native flex row.
export const branding = { aspectRatio:1149/526, symbolSize:44, startupSize:88, headerMinHeight:72, aboutWidth:360 } as const;
export const brandStyles = StyleSheet.create({
 header:{minHeight:branding.headerMinHeight,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8},
 identity:{flex:1,minWidth:0,gap:0},
 symbol:{width:branding.symbolSize,height:branding.symbolSize,flexShrink:0},
 startupSymbol:{width:branding.startupSize,height:branding.startupSize},
 startup:{alignItems:'center',gap:12},
 navigation:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:0},
 pageTitle:{flex:1,minWidth:0},
 about:{width:'100%',maxWidth:branding.aboutWidth,aspectRatio:branding.aspectRatio,alignSelf:'center'},
});
