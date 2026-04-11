// Wizard state for the Röbel Card partner registration flow.
// Mirrors context/CreateOrgWizardContext.tsx.

import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';
import type { Rechtsform } from '@/lib/supabase-roebel-card-partners';

export type PartnerRegisterState = {
  selectedAccountId: string | null;
  rechtsform: Rechtsform | null;
  vatId: string; // optional — '' means not provided
  iban: string;
  bic: string; // optional
  accountHolder: string; // pre-filled from business name, editable
  agbAccepted: boolean;
  authorityAccepted: boolean;
  isSubmitting: boolean;
  newPartnerId: string | null;
};

type Action =
  | { type: 'SELECT_ACCOUNT'; payload: { accountId: string; accountName: string } }
  | { type: 'SET_INFO'; payload: { rechtsform: Rechtsform; vatId: string } }
  | { type: 'SET_BANK'; payload: { iban: string; bic: string; accountHolder: string } }
  | { type: 'SET_AGREEMENT'; payload: { agbAccepted: boolean; authorityAccepted: boolean } }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_NEW_PARTNER_ID'; payload: string }
  | { type: 'RESET' };

const initialState: PartnerRegisterState = {
  selectedAccountId: null,
  rechtsform: null,
  vatId: '',
  iban: '',
  bic: '',
  accountHolder: '',
  agbAccepted: false,
  authorityAccepted: false,
  isSubmitting: false,
  newPartnerId: null,
};

function reducer(state: PartnerRegisterState, action: Action): PartnerRegisterState {
  switch (action.type) {
    case 'SELECT_ACCOUNT':
      // Pre-fill the account holder field with the business name on first select.
      return {
        ...state,
        selectedAccountId: action.payload.accountId,
        accountHolder: state.accountHolder || action.payload.accountName,
      };
    case 'SET_INFO':
      return { ...state, ...action.payload };
    case 'SET_BANK':
      return { ...state, ...action.payload };
    case 'SET_AGREEMENT':
      return { ...state, ...action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'SET_NEW_PARTNER_ID':
      return { ...state, newPartnerId: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface ContextValue {
  state: PartnerRegisterState;
  dispatch: React.Dispatch<Action>;
}

const WizardContext = createContext<ContextValue | undefined>(undefined);

export function PartnerRegisterWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function usePartnerRegisterWizard(): ContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error(
      'usePartnerRegisterWizard must be used within a PartnerRegisterWizardProvider',
    );
  }
  return ctx;
}
