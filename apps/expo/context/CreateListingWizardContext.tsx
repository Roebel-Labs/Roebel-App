import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';

export type ListingTypeChoice = 'product' | 'service';
export type PriceTypeChoice = 'fixed' | 'negotiable' | 'free';
export type ConditionChoice = 'neu' | 'wie_neu' | 'gut' | 'akzeptabel';

export type ListingWizardState = {
  listingType: ListingTypeChoice | null;
  category: string | null;
  title: string;
  description: string;
  priceType: PriceTypeChoice;
  price: string;
  condition: ConditionChoice | null;
  mediaUrls: string[];
  neighborhood: string;
  accountId: string | null;
  isSubmitting: boolean;
  newListingId: string | null;
};

type WizardAction =
  | { type: 'SET_TYPE'; payload: { listingType: ListingTypeChoice; category: string | null } }
  | { type: 'SET_DETAILS'; payload: { title: string; description: string } }
  | { type: 'SET_PRICING'; payload: { priceType: PriceTypeChoice; price: string; condition: ConditionChoice | null } }
  | { type: 'SET_PHOTOS'; payload: string[] }
  | { type: 'ADD_PHOTO'; payload: string }
  | { type: 'REMOVE_PHOTO'; payload: number }
  | { type: 'SET_LOCATION'; payload: string }
  | { type: 'SET_ACCOUNT_ID'; payload: string | null }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_NEW_LISTING_ID'; payload: string }
  | { type: 'RESET' };

const initialState: ListingWizardState = {
  listingType: null,
  category: null,
  title: '',
  description: '',
  priceType: 'fixed',
  price: '',
  condition: 'gut',
  mediaUrls: [],
  neighborhood: '',
  accountId: null,
  isSubmitting: false,
  newListingId: null,
};

function reducer(state: ListingWizardState, action: WizardAction): ListingWizardState {
  switch (action.type) {
    case 'SET_TYPE':
      return { ...state, listingType: action.payload.listingType, category: action.payload.category };
    case 'SET_DETAILS':
      return { ...state, title: action.payload.title, description: action.payload.description };
    case 'SET_PRICING':
      return {
        ...state,
        priceType: action.payload.priceType,
        price: action.payload.price,
        condition: action.payload.condition,
      };
    case 'SET_PHOTOS':
      return { ...state, mediaUrls: action.payload };
    case 'ADD_PHOTO':
      return { ...state, mediaUrls: [...state.mediaUrls, action.payload] };
    case 'REMOVE_PHOTO':
      return { ...state, mediaUrls: state.mediaUrls.filter((_, i) => i !== action.payload) };
    case 'SET_LOCATION':
      return { ...state, neighborhood: action.payload };
    case 'SET_ACCOUNT_ID':
      return { ...state, accountId: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'SET_NEW_LISTING_ID':
      return { ...state, newListingId: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface ContextValue {
  state: ListingWizardState;
  dispatch: React.Dispatch<WizardAction>;
  isOrgListing: boolean;
}

const WizardContext = createContext<ContextValue | undefined>(undefined);

export function CreateListingWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isOrgListing = state.accountId !== null;

  const value = useMemo(() => ({ state, dispatch, isOrgListing }), [state, isOrgListing]);

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useCreateListingWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useCreateListingWizard must be used within CreateListingWizardProvider');
  return ctx;
}
