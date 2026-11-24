import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

// Windmill mark from the app icon (same path as AnimatedSplash), white on the navy tile.
const WINDMILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><path d="M139.084 277.371H91.3125C96.5506 332.056 136.947 441.428 256.627 441.428C376.307 441.428 414.189 344.628 418.17 296.228L392.398 290.571L360.97 163.599L334.57 290.571V332.685H291.827C289.941 325.352 286.044 310.308 285.541 308.799C285.038 307.291 285.751 307.333 286.17 307.542L294.341 315.714L314.455 296.228L277.998 261.028L313.827 225.199L293.713 205.085L262.913 234.628C261.865 233.999 259.141 232.742 256.627 232.742C254.113 232.742 250.97 233.999 249.713 234.628L220.17 205.085L197.541 225.199L235.255 260.399L198.17 296.228L219.541 316.971C221.846 314.456 226.707 309.302 227.713 308.799C228.718 308.296 228.97 309.009 228.97 309.428L223.312 332.685H181.198C179.187 303.519 174.074 246.361 171.77 221.428L157.312 162.971L143.484 221.428L139.084 277.371Z" fill="white"/></svg>`;

const NAVY = '#00498B';

/** Röbel app mark: white windmill on a navy rounded tile (the home-screen icon). */
export default function RoebelLogo({ size = 88 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.23,
        backgroundColor: NAVY,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <SvgXml xml={WINDMILL} width={size * 1.15} height={size * 1.15} />
    </View>
  );
}
