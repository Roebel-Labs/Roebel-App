/**
 * The API wrappers are deliberately thin: their job is to pin each endpoint's
 * path, method and body shape so no screen has to remember them. These tests
 * assert exactly that, against a stubbed gpFetch.
 */
import * as client from '../gnosispay/client';
import {
  REQUIRED_TERMS,
  acceptTerm,
  deploySafe,
  getKycLink,
  getSafeConfig,
  getSafeDeployStatus,
  getUser,
  requestPhoneOtp,
  signup,
  submitSourceOfFunds,
  verifyPhoneOtp,
} from '../gnosispay/api';

jest.mock('../gnosispay/client', () => ({
  ...jest.requireActual('../gnosispay/client'),
  gpFetch: jest.fn(),
}));

const gpFetch = client.gpFetch as jest.Mock;

beforeEach(() => {
  gpFetch.mockReset();
  gpFetch.mockResolvedValue({ ok: true, data: {} });
});

describe('signup', () => {
  it('posts the email together with the partner id', async () => {
    await signup('wirt@roebel.de', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/auth/signup', {
      method: 'POST',
      token: 'jwt',
      body: { authEmail: 'wirt@roebel.de', partnerId: client.GP_PARTNER_ID },
    });
  });
});

describe('getUser', () => {
  it('reads the user with a bearer token and no body', async () => {
    await getUser('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/user', { token: 'jwt' });
  });
});

describe('terms', () => {
  it('names the three terms the flow must accept', () => {
    expect(REQUIRED_TERMS).toEqual(['general-tos', 'card-monavate-tos', 'privacy-policy']);
  });

  it('posts the term id and version', async () => {
    await acceptTerm('general-tos', '1.2', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/user/terms', {
      method: 'POST',
      token: 'jwt',
      body: { terms: 'general-tos', version: '1.2' },
    });
  });
});

describe('getKycLink', () => {
  it('asks for the German hosted flow by default', async () => {
    await getKycLink('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/kyc/integration?lang=de', { token: 'jwt' });
  });

  it('honours an explicit language', async () => {
    await getKycLink('jwt', 'en');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/kyc/integration?lang=en', { token: 'jwt' });
  });
});

describe('submitSourceOfFunds', () => {
  it('posts the answers as a question/answer array', async () => {
    await submitSourceOfFunds([{ question: 'Herkunft?', answer: 'Umsatz' }], 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/source-of-funds', {
      method: 'POST',
      token: 'jwt',
      body: { answers: [{ question: 'Herkunft?', answer: 'Umsatz' }] },
    });
  });
});

describe('phone verification', () => {
  it('requests an OTP for a phone number', async () => {
    await requestPhoneOtp('+4915112345678', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/verification', {
      method: 'POST',
      token: 'jwt',
      body: { phoneNumber: '+4915112345678' },
    });
  });

  it('checks the code on the check endpoint', async () => {
    await verifyPhoneOtp('123456', 'jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/verification/check', {
      method: 'POST',
      token: 'jwt',
      body: { code: '123456' },
    });
  });
});

describe('safe deployment', () => {
  it('posts an empty body when no allowance is given', async () => {
    await deploySafe('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe/deploy', {
      method: 'POST',
      token: 'jwt',
      body: {},
    });
  });

  it('passes a daily allowance in whole token units when given', async () => {
    await deploySafe('jwt', 350);
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe/deploy', {
      method: 'POST',
      token: 'jwt',
      body: { dailyAllowance: 350 },
    });
  });

  it('polls deployment status on the same path with GET', async () => {
    await getSafeDeployStatus('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe/deploy', { token: 'jwt' });
  });

  it('reads the finished config from safe-config', async () => {
    await getSafeConfig('jwt');
    expect(gpFetch).toHaveBeenCalledWith('/api/v1/safe-config', { token: 'jwt' });
  });
});
