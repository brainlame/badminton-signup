import { ToastProvider } from '../lib/ToastContext';
import QueueDisplay from './QueueDisplay';

/**
 * Hydration root for the public queue page.
 *
 * The ToastProvider and the page component must live in the same React tree,
 * so they are composed here in React rather than slotted in from Astro —
 * children passed into a `client:only` island are server-rendered static HTML
 * and never hydrate.
 */
export default function QueueApp() {
  return (
    <ToastProvider>
      <QueueDisplay />
    </ToastProvider>
  );
}
