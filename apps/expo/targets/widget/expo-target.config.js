/**
 * iOS home-screen widgets "Mini Apps", "Mittagstisch" and "Events" (WidgetKit + SwiftUI), linked into the Xcode
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
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  colors: {
    $widgetBackground: { light: '#ffffff', dark: '#18191B' },
    $accent: '#00498B',
    widgetText: { light: '#000000', dark: '#e8eaed' },
    widgetTileFallback: { light: '#F7F7F7', dark: '#3c4043' },
    // App tokens (constants/theme.ts): textSecondary, border, error.
    widgetSub: { light: '#6B7280', dark: '#9AA0A6' },
    widgetBorder: { light: '#E5E7EB', dark: '#3C4043' },
    widgetRed: { light: '#DC2626', dark: '#F87171' },
    // Mittagstisch ‹ › arrows: black in light, white in dark mode.
    widgetArrow: { light: '#000000', dark: '#FFFFFF' },
    // Round background behind the ‹ › arrows.
    widgetButton: { light: '#EEEFF1', dark: '#2F3236' },
    // Weekday band at the top of the events date tile.
    widgetBand: { light: '#F2F3F5', dark: '#2A2C2F' },
  },
  images: {
    storeIcon: '../../assets/illustration/mini-app-store.png',
    appBadge: '../../assets/widgets/app-badge.png',
    // Widget gallery samples (real Röbel content, see scripts/render-widget-previews.py).
    previewEvent: '../../assets/widgets/sample/event.png',
    previewDish1: '../../assets/widgets/sample/dish1.png',
    previewDish2: '../../assets/widgets/sample/dish2.png',
    previewDish3: '../../assets/widgets/sample/dish3.png',
    previewDish4: '../../assets/widgets/sample/dish4.png',
    previewAppAbfall: '../../assets/widgets/sample/app-abfall.png',
    previewAppBus: '../../assets/widgets/sample/app-bus.png',
    previewAppStadt: '../../assets/widgets/sample/app-stadt.png',
    previewAppQuiz: '../../assets/widgets/sample/app-quiz.png',
    previewAppPolitik: '../../assets/widgets/sample/app-politik.png',
    previewAppSitzungen: '../../assets/widgets/sample/app-sitzungen.png',
    previewAppPhone: '../../assets/widgets/sample/app-phone.png',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
