const expoPreset = require('jest-expo/jest-preset');
module.exports = {
 preset: 'jest-expo', testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'], clearMocks: true,
 // The documented per-icon entry points ship TypeScript source. Transform the
 // real icons and patched ESM decoder; retain the remaining SDK preset rules.
 transformIgnorePatterns: expoPreset.transformIgnorePatterns.map(pattern=>pattern.replace('(?!(.pnpm|','(?!(decode-uri-component|phosphor-react-native|.pnpm|')),
};
