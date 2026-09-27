/**
 * The Anmelden sheet: with the passkey gate closed (production) it renders exactly the old
 * options; with the gate open the "Unabhängiges Konto" option comes first.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockGate = jest.fn(async () => false);
jest.mock('@/lib/passkey/gate', () => ({ isPasskeyPreviewAllowed: () => mockGate() }));
jest.mock('thirdweb/react', () => {
  const { Text } = require('react-native');
  return {
    ConnectEmbed: () => <Text>THIRDWEB_CONNECT_EMBED</Text>,
    useSetActiveWallet: () => jest.fn(),
  };
});
jest.mock('@/constants/thirdweb', () => ({ client: {}, chain: { id: 100 } }));
jest.mock('@/constants/wallets', () => ({ wallets: [] }));
jest.mock('@/components/BottomDrawer', () => ({ children }: { children: React.ReactNode }) => <>{children}</>);
jest.mock('@/components/passkey/PasskeyEntryLinks', () => () => null);
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));

import LoginDrawer from '@/components/LoginDrawer';

function texts(r: TestRenderer.ReactTestRenderer): string[] {
  const { Text } = require('react-native');
  return r.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));
}

async function render(): Promise<TestRenderer.ReactTestRenderer> {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<LoginDrawer visible onClose={() => undefined} />);
  });
  await act(async () => undefined);
  return r;
}

describe('LoginDrawer + passkey option', () => {
  it('gate closed: only the old options (thirdweb embed), no passkey option', async () => {
    mockGate.mockResolvedValue(false);
    const t = texts(await render());
    expect(t).toContain('THIRDWEB_CONNECT_EMBED');
    expect(t.some((s) => s.includes('Unabhängiges Konto'))).toBe(false);
    expect(t.some((s) => s.includes('Passkey'))).toBe(false);
  });

  it('gate open: "Unabhängiges Konto" comes before the unchanged thirdweb options', async () => {
    mockGate.mockResolvedValue(true);
    const t = texts(await render());
    const passkey = t.indexOf('Unabhängiges Konto');
    expect(passkey).toBeGreaterThanOrEqual(0);
    expect(t).toContain('Mit Passkey · Fingerabdruck oder Gesicht, ohne E-Mail. Nur du hast den Schlüssel.');
    expect(passkey).toBeLessThan(t.indexOf('THIRDWEB_CONNECT_EMBED'));
  });
});
