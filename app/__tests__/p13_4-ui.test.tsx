import React from 'react';
import {Animated,StyleSheet} from 'react-native';
import {render,screen} from '@testing-library/react-native';
let mockReduced=false;
jest.mock('../src/design/ThemeProvider',()=>({useTheme:()=>({colors:require('../src/design/stitch').stitchColors,borderWidth:1,theme:'dark',textSize:'standard',reduceMotion:mockReduced})}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key,i18n:{language:'en'}})}));
import {VoicePlaceholder} from '../src/components/brand/VoicePlaceholder';
import {stitch,stitchColors} from '../src/design/stitch';
import {MicrophoneIcon} from 'phosphor-react-native/src/icons/Microphone';
let start:jest.Mock,stop:jest.Mock;
beforeEach(()=>{mockReduced=false;start=jest.fn();stop=jest.fn();jest.spyOn(Animated,'loop').mockReturnValue({start,stop,reset:jest.fn()});});
afterEach(()=>jest.restoreAllMocks());
const core=()=>StyleSheet.flatten(screen.getByTestId('microphone-core').props.style);
test('idle/starting/listening/processing preserve dimensions and distinguish native readiness',()=>{
 const page=render(<VoicePlaceholder/>);expect(core()).toMatchObject({width:stitch.microphone,height:stitch.microphone,backgroundColor:stitchColors.surface1});
 page.rerender(<VoicePlaceholder starting disabled caption="starting"/>);expect(core().borderColor).toBe(stitchColors.success);expect(screen.getByRole('button').props.accessibilityState.busy).toBe(true);expect(screen.queryByTestId('microphone-listening-ring')).toBeNull();
 page.rerender(<VoicePlaceholder listening/>);expect(core().backgroundColor).toBe(stitchColors.accent);expect(screen.UNSAFE_getByType(MicrophoneIcon).props.color).toBe(stitchColors.onAccent);expect(screen.getByTestId('microphone-listening-ring')).toBeTruthy();expect(start).toHaveBeenCalledTimes(1);
 page.rerender(<VoicePlaceholder processing/>);expect(stop).toHaveBeenCalled();expect(core().backgroundColor).toBe(stitchColors.surface1);expect(screen.getByTestId('microphone-processing-ring')).toBeTruthy();
 page.rerender(<VoicePlaceholder caption="localized error"/>);expect(screen.queryByTestId('microphone-processing-ring')).toBeNull();expect(core().backgroundColor).toBe(stitchColors.surface1);expect(screen.getByText('localized error')).toBeTruthy();
});
test.each(['listening','processing'] as const)('%s reduced motion keeps static indicator without scheduling loops',phase=>{
 mockReduced=true;render(<VoicePlaceholder {...{[phase]:true}}/>);expect(Animated.loop).not.toHaveBeenCalled();expect(screen.getByTestId('microphone-'+phase+'-ring')).toBeTruthy();
});
test('switching reduced motion on cancels active pulse; unmount cleans up',()=>{
 const page=render(<VoicePlaceholder listening/>);expect(start).toHaveBeenCalledTimes(1);mockReduced=true;page.rerender(<VoicePlaceholder listening/>);expect(stop).toHaveBeenCalledTimes(1);expect(start).toHaveBeenCalledTimes(1);page.unmount();
});

test('Talk outer ring stays outside unchanged prominent core and inside existing touch target',()=>{
 render(<VoicePlaceholder prominent listening/>);
 const ring=StyleSheet.flatten(screen.getByTestId('microphone-listening-ring').props.style);
 expect(core().width).toBe(88);expect(ring.width).toBeGreaterThan(core().width);expect(ring.width*stitch.microphonePulseScale).toBeLessThanOrEqual(stitch.microphoneGlow);
});
