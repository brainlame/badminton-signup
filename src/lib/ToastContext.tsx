import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Toast from '../components/Toast';

interface ToastContextType {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Stable fallback for when provider is missing (e.g., SSR)
const NOOP_TOAST: ToastContextType = { showToast: () => {} };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; duration: number } | null>(null);

  const showToast = useCallback((message: string, duration: number = 5000) => {
    setToast({ message, duration });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          onClose={hideToast}
          duration={toast.duration}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  return context || NOOP_TOAST;
}
