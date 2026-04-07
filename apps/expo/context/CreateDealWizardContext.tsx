import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';

export type DealTypeChoice = 'discount' | 'special' | 'event' | 'new_product';

export type DealWizardState = {
  dealType: DealTypeChoice | null;
  title: string;
  description: string;
  dealValue: string;
  imageUrl: string | null;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active';
  businessId: string | null;
  isSubmitting: boolean;
  newDealId: string | null;
};

type WizardAction =
  | { type: 'SET_TYPE'; payload: DealTypeChoice }
  | { type: 'SET_DETAILS'; payload: { title: string; description: string; dealValue: string } }
  | { type: 'SET_IMAGE'; payload: string | null }
  | { type: 'SET_SCHEDULE'; payload: { startDate: string; endDate: string; status: 'draft' | 'active' } }
  | { type: 'SET_BUSINESS_ID'; payload: string }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_NEW_DEAL_ID'; payload: string }
  | { type: 'RESET' };

const initialState: DealWizardState = {
  dealType: null,
  title: '',
  description: '',
  dealValue: '',
  imageUrl: null,
  startDate: '',
  endDate: '',
  status: 'active',
  businessId: null,
  isSubmitting: false,
  newDealId: null,
};

function reducer(state: DealWizardState, action: WizardAction): DealWizardState {
  switch (action.type) {
    case 'SET_TYPE':
      return { ...state, dealType: action.payload };
    case 'SET_DETAILS':
      return { ...state, title: action.payload.title, description: action.payload.description, dealValue: action.payload.dealValue };
    case 'SET_IMAGE':
      return { ...state, imageUrl: action.payload };
    case 'SET_SCHEDULE':
      return { ...state, startDate: action.payload.startDate, endDate: action.payload.endDate, status: action.payload.status };
    case 'SET_BUSINESS_ID':
      return { ...state, businessId: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'SET_NEW_DEAL_ID':
      return { ...state, newDealId: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface ContextValue {
  state: DealWizardState;
  dispatch: React.Dispatch<WizardAction>;
}

const WizardContext = createContext<ContextValue | undefined>(undefined);

export function CreateDealWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useCreateDealWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useCreateDealWizard must be used within CreateDealWizardProvider');
  return ctx;
}
