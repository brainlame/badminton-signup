import { ToastProvider } from '../lib/ToastContext';
import type { ReactNode } from 'react';

interface AppWithToastProps {
  children: ReactNode;
}

/**
 * Wrapper component to ensure ToastProvider and its children
 * are hydrated as a single React root, allowing context to work properly.
 */
export default function AppWithToast({ children }: AppWithToastProps) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
