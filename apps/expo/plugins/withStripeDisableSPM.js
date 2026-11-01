const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * @stripe/stripe-react-native 0.78 resolves the Stripe iOS SDK through Swift
 * Package Manager on RN >= 0.75, which requires dynamic frameworks. This app
 * links statically (XMTP/SQLCipher, Mapbox and OpenSSL are tuned for that),
 * so `pod install` aborts (EAS build c3a62735, 2026-11-01, first iOS build
 * with the Stripe SDK). Stripe's documented opt-out resolves the same SDK
 * through CocoaPods instead. Deprecated upstream: revisit when bumping Stripe.
 */
const LINE = '$StripeDisableSPM = true';

function addStripeDisableSPM(podfile) {
  if (podfile.includes(LINE)) return podfile;
  return `${LINE}\n${podfile}`;
}

const withStripeDisableSPM = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      fs.writeFileSync(file, addStripeDisableSPM(fs.readFileSync(file, 'utf8')));
      return cfg;
    },
  ]);

module.exports = withStripeDisableSPM;
module.exports.addStripeDisableSPM = addStripeDisableSPM;
