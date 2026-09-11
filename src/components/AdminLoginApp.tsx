import { ToastProvider } from '../lib/ToastContext';
import AdminLogin from './AdminLogin';

/** Hydration root for /admin/login. See QueueApp for why this wrapper exists. */
export default function AdminLoginApp() {
  return (
    <ToastProvider>
      <AdminLogin />
    </ToastProvider>
  );
}
