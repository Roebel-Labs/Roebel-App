import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ExploreDotContextValue = {
  visible: boolean;
  dismiss: () => void;
};

const ExploreDotContext = createContext<ExploreDotContextValue | undefined>(undefined);

export function ExploreDotProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ visible, dismiss }), [visible, dismiss]);

  return <ExploreDotContext.Provider value={value}>{children}</ExploreDotContext.Provider>;
}

export function useExploreDot(): ExploreDotContextValue {
  const context = useContext(ExploreDotContext);
  if (!context) {
    throw new Error('useExploreDot must be used within ExploreDotProvider');
  }
  return context;
}
