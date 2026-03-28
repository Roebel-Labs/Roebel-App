import React, { createContext, useCallback, useContext, useState } from 'react';
import Snackbar from '@/components/Snackbar';

type SnackbarConfig = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

type SnackbarContextValue = {
  showSnackbar: (config: SnackbarConfig) => void;
  hideSnackbar: () => void;
};

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<SnackbarConfig>({
    message: '',
    duration: 4000,
  });

  const showSnackbar = useCallback((newConfig: SnackbarConfig) => {
    setConfig(newConfig);
    setVisible(true);
  }, []);

  const hideSnackbar = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar }}>
      {children}
      <Snackbar
        visible={visible}
        message={config.message}
        actionLabel={config.actionLabel}
        onAction={config.onAction}
        onDismiss={hideSnackbar}
        duration={config.duration}
      />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within SnackbarProvider');
  return ctx;
}
