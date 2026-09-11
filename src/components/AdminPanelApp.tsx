import { ToastProvider } from '../lib/ToastContext';
import AdminPanel from './AdminPanel';

/** Hydration root for /admin. See QueueApp for why this wrapper exists. */
export default function AdminPanelApp() {
  return (
    <ToastProvider>
      <AdminPanel />
    </ToastProvider>
  );
}
