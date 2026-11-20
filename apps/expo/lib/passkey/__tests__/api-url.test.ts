/**
 * OTA exports run from worktrees whose .env may lack EXPO_PUBLIC_PASSKEY_API_URL. Every passkey
 * write (Münzen claim, sponsor, bundler) needs the URL, so a missing env var must not break them.
 */
const ENV_KEY = 'EXPO_PUBLIC_PASSKEY_API_URL';

function loadConstants(value: string | undefined) {
  const previous = process.env[ENV_KEY];
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
  try {
    let loaded!: typeof import('../constants');
    jest.isolateModules(() => {
      loaded = require('../constants');
    });
    return loaded;
  } finally {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  }
}

describe('PASSKEY_API_URL', () => {
  it.each([undefined, ''])('falls back to the production API when the env var is %p', (value) => {
    const c = loadConstants(value);
    expect(c.PASSKEY_API_URL).toBe('https://www.roebel.app');
    expect(c.PASSKEY_BUNDLER_URL).toBe('https://www.roebel.app/api/bundler');
  });

  it('lets a fork or staging build override the API', () => {
    const c = loadConstants('https://staging.example');
    expect(c.PASSKEY_API_URL).toBe('https://staging.example');
    expect(c.PASSKEY_BUNDLER_URL).toBe('https://staging.example/api/bundler');
  });
});
