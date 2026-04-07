import { inAppWallet } from 'thirdweb/wallets/in-app';
import { chain } from './thirdweb';
import * as Linking from 'expo-linking';

export const redirectUrl = Linking.createURL('/profile');

export const wallets = [
  inAppWallet({
    auth: {
      options: ['email', 'google', 'facebook', 'apple'],
      redirectUrl,
    },
    smartAccount: {
      chain,
      sponsorGas: true,
    },
  }),
];
