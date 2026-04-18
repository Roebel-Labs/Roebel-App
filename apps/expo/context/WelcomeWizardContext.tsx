import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';

export type PreferredRole = 'buerger' | 'tourist';

export type WelcomeWizardState = {
  name: string;
  preferredRole: PreferredRole | null;
  isSubmitting: boolean;
};

type WelcomeWizardAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_ROLE'; payload: PreferredRole }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'RESET' };

const initialState: WelcomeWizardState = {
  name: '',
  preferredRole: null,
  isSubmitting: false,
};

function reducer(state: WelcomeWizardState, action: WelcomeWizardAction): WelcomeWizardState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.payload };
    case 'SET_ROLE':
      return { ...state, preferredRole: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface ContextValue {
  state: WelcomeWizardState;
  dispatch: React.Dispatch<WelcomeWizardAction>;
}

const WelcomeWizardContext = createContext<ContextValue | undefined>(undefined);

export function WelcomeWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <WelcomeWizardContext.Provider value={value}>{children}</WelcomeWizardContext.Provider>;
}

export function useWelcomeWizard() {
  const ctx = useContext(WelcomeWizardContext);
  if (!ctx) throw new Error('useWelcomeWizard must be used within WelcomeWizardProvider');
  return ctx;
}
