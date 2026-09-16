/**
 * posthog-react-native must stay off on iOS: the SDK crashes Hermes at launch
 * on iOS 26.4 arm64e devices (PostHog/posthog-js#3562). The gate is a pure
 * function of the platform so the rule is testable without React Native.
 */
import { isPostHogSupportedOn } from '@/lib/analytics';

describe('isPostHogSupportedOn', () => {
  it('keeps PostHog off on iOS', () => {
    expect(isPostHogSupportedOn('ios')).toBe(false);
  });

  it('allows PostHog on Android and web', () => {
    expect(isPostHogSupportedOn('android')).toBe(true);
    expect(isPostHogSupportedOn('web')).toBe(true);
  });
});
