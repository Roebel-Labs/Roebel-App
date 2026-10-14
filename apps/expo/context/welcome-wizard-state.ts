import type { CitizenIdentity } from '@/lib/verification-types';

export type PreferredRole = 'buerger' | 'tourist' | 'organisation';

export type WelcomeWizardState = {
  displayName: string;
  preferredRole: PreferredRole | null;
  /** Bürger path only: identity fields collected in /welcome/citizen-data. */
  citizenData: CitizenIdentity | null;
  /** Follow step: every town account offered, and the ones the person unticked. */
  followAll: string[];
  followUnticked: string[];
  isSubmitting: boolean;
};

export type WelcomeWizardAction =
  | { type: 'SET_DISPLAY_NAME'; payload: string }
  | { type: 'SET_ROLE'; payload: PreferredRole }
  | { type: 'SET_CITIZEN_DATA'; payload: CitizenIdentity | null }
  | { type: 'SET_FOLLOW_ALL'; payload: string[] }
  | { type: 'SET_FOLLOW_UNTICKED'; payload: string[] }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'RESET' };

export const initialState: WelcomeWizardState = {
  displayName: '',
  preferredRole: null,
  citizenData: null,
  followAll: [],
  followUnticked: [],
  isSubmitting: false,
};

export function reducer(state: WelcomeWizardState, action: WelcomeWizardAction): WelcomeWizardState {
  switch (action.type) {
    case 'SET_DISPLAY_NAME':
      return { ...state, displayName: action.payload };
    case 'SET_ROLE':
      return { ...state, preferredRole: action.payload };
    case 'SET_CITIZEN_DATA':
      return { ...state, citizenData: action.payload };
    case 'SET_FOLLOW_ALL':
      return { ...state, followAll: action.payload };
    case 'SET_FOLLOW_UNTICKED':
      return { ...state, followUnticked: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}
