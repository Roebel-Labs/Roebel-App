import React, { createContext, useContext, useReducer, useMemo, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { updateUserOnboarding } from '@/lib/supabase-users';
import ExitWizardSheet from '@/components/ExitWizardSheet';

export type PreferredRole = 'buerger' | 'tourist';

export type WelcomeWizardState = {
  displayName: string;
  preferredRole: PreferredRole | null;
  isSubmitting: boolean;
};

type WelcomeWizardAction =
  | { type: 'SET_DISPLAY_NAME'; payload: string }
  | { type: 'SET_ROLE'; payload: PreferredRole }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'RESET' };

const initialState: WelcomeWizardState = {
  displayName: '',
  preferredRole: null,
  isSubmitting: false,
};

function reducer(state: WelcomeWizardState, action: WelcomeWizardAction): WelcomeWizardState {
  switch (action.type) {
    case 'SET_DISPLAY_NAME':
      return { ...state, displayName: action.payload };
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
  openExit: () => void;
}

const WelcomeWizardContext = createContext<ContextValue | undefined>(undefined);

export function WelcomeWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const router = useRouter();
  const { user, refreshUser } = useUser();
  const [showExit, setShowExit] = useState(false);

  const markCompletedAndExit = useCallback(async () => {
    if (user?.wallet_address) {
      try {
        await updateUserOnboarding(user.wallet_address, { markCompleted: true });
        await refreshUser();
      } catch (err) {
        console.error('Failed to mark onboarding complete on exit:', err);
      }
    }
    dispatch({ type: 'RESET' });
    setShowExit(false);
    router.replace('/profile');
  }, [user?.wallet_address, refreshUser, router]);

  const openExit = useCallback(() => setShowExit(true), []);
  const closeExit = useCallback(() => setShowExit(false), []);

  const value = useMemo(() => ({ state, dispatch, openExit }), [state, openExit]);

  return (
    <WelcomeWizardContext.Provider value={value}>
      {children}
      <ExitWizardSheet
        visible={showExit}
        onDelete={markCompletedAndExit}
        onSaveAndExit={markCompletedAndExit}
        onCancel={closeExit}
      />
    </WelcomeWizardContext.Provider>
  );
}

export function useWelcomeWizard() {
  const ctx = useContext(WelcomeWizardContext);
  if (!ctx) throw new Error('useWelcomeWizard must be used within WelcomeWizardProvider');
  return ctx;
}
