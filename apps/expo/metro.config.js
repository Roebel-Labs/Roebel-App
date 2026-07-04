// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// --- pnpm monorepo support -------------------------------------------------
// The app consumes ONE workspace package that lives outside apps/expo and ships
// untranspiled TS source: @netizen/miniapp-sdk. Metro must be allowed to read
// its files. We watch ONLY that package (not the whole repo root) — watching the
// entire monorepo made Metro's file map crawl apps/web's heavy crypto deps, both
// Next mini apps, and contracts, blowing the bundler's heap (OOM at ~2GB during
// `expo export --platform=all`). The SDK is zero-dependency, so its own imports
// resolve within its folder; all of the app's deps stay in apps/expo/node_modules
// (pnpm), so no root nodeModulesPaths override is needed.
config.watchFolders = [path.resolve(__dirname, "../../packages/miniapp-sdk")];

// SVG transformer configuration
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// Add Node.js polyfills for React Native
config.resolver.extraNodeModules = {
  crypto: require.resolve('react-native-quick-crypto'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  process: require.resolve('process/browser.js'),
  path: require.resolve('path-browserify'),
  os: require.resolve('os-browserify/browser'),
  http: require.resolve('http-browserify'),
  https: require.resolve('https-browserify'),
  url: require.resolve('url'),
  assert: require.resolve('assert'),
  util: require.resolve('util'),
  querystring: require.resolve('querystring'),
  events: require.resolve('events'),
  net: require.resolve('react-native-tcp-socket'),
  tls: require.resolve('react-native-tcp-socket'),
  ws: require.resolve('isomorphic-ws'),
};

// Ensure these globals are available
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Block problematic server modules
config.resolver.blockList = [
  /ws\/lib\/websocket-server\.js$/,
  /ws\/wrapper\.mjs$/,
];

// Custom resolver to exclude problematic modules from bundle
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Exclude react-native-mmkv (all platforms)
  if (moduleName === 'react-native-mmkv' || moduleName.includes('react-native-mmkv')) {
    return { type: 'empty' };
  }

  // Exclude native-only modules on web
  if (platform === 'web') {
    const webExclude = [
      'react-native-tcp-socket',
      'react-native-quick-crypto',
      'react-native-aes-gcm-crypto',
      'react-native-passkey',
      '@rnmapbox/maps',
      '@coinbase/wallet-mobile-sdk',
      '@walletconnect/react-native-compat',
      'react-native-qrcode-svg',
      'expo-screen-orientation',
      'react-native-web-webview',
      'react-native-pager-view',
    ];
    if (webExclude.some(pkg => moduleName === pkg || moduleName.startsWith(pkg + '/'))) {
      return { type: 'empty' };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
