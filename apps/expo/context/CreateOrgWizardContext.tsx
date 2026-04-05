import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';
import type { BusinessCategory, OpeningHours } from '@/lib/types';

export type OrgTypeChoice = 'restaurant' | 'unternehmen' | 'verein' | 'partei' | 'fraktion';

export type WizardState = {
  orgType: OrgTypeChoice | null;
  name: string;
  description: string;
  category: BusinessCategory | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  phone: string;
  email: string;
  website: string;
  openingHours: OpeningHours | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  isSubmitting: boolean;
};

type WizardAction =
  | { type: 'SET_ORG_TYPE'; payload: OrgTypeChoice }
  | { type: 'SET_INFO'; payload: { name: string; description: string; category: BusinessCategory | null } }
  | { type: 'SET_LOCATION'; payload: { address: string; latitude: number | null; longitude: number | null; formattedAddress: string | null } }
  | { type: 'SET_CONTACT'; payload: { phone: string; email: string; website: string; openingHours: OpeningHours | null } }
  | { type: 'SET_PHOTOS'; payload: { logoUrl: string | null; coverImageUrl: string | null } }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'RESET' };

const initialState: WizardState = {
  orgType: null, name: '', description: '', category: null,
  address: '', latitude: null, longitude: null, formattedAddress: null,
  phone: '', email: '', website: '', openingHours: null,
  logoUrl: null, coverImageUrl: null, isSubmitting: false,
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_ORG_TYPE': return { ...state, orgType: action.payload };
    case 'SET_INFO': return { ...state, ...action.payload };
    case 'SET_LOCATION': return { ...state, ...action.payload };
    case 'SET_CONTACT': return { ...state, ...action.payload };
    case 'SET_PHOTOS': return { ...state, ...action.payload };
    case 'SET_SUBMITTING': return { ...state, isSubmitting: action.payload };
    case 'RESET': return initialState;
    default: return state;
  }
}

interface ContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  needsCategory: boolean;
}

const WizardContext = createContext<ContextValue | undefined>(undefined);

export function CreateOrgWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const needsCategory = state.orgType === 'restaurant' || state.orgType === 'unternehmen';

  const value = useMemo(() => ({ state, dispatch, needsCategory }), [state, needsCategory]);

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useCreateOrgWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useCreateOrgWizard must be used within CreateOrgWizardProvider');
  return ctx;
}
