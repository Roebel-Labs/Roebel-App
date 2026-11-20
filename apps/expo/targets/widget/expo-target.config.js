/**
 * iOS home-screen widget "Mini Apps" (WidgetKit + SwiftUI), linked into the Xcode
 * project at prebuild by @bacons/apple-targets. The app writes the payload into the
 * shared App Group (lib/widget-platform.ios.ts); the widget only reads it.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'RoebelWidget',
  displayName: 'Röbel',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $widgetBackground: { light: '#ffffff', dark: '#18191B' },
    $accent: '#00498B',
    widgetText: { light: '#000000', dark: '#e8eaed' },
    widgetTileFallback: { light: '#F7F7F7', dark: '#3c4043' },
  },
  images: {
    storeIcon: '../../assets/illustration/mini-app-store.png',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
