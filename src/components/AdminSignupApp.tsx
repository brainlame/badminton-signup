import { ToastProvider } from '../lib/ToastContext';
import AdminSignup from './AdminSignup';

/** Hydration root for /admin/signup. See QueueApp for why this wrapper exists. */
export default function AdminSignupApp() {
  return (
    <ToastProvider>
      <AdminSignup />
    </ToastProvider>
  );
}
