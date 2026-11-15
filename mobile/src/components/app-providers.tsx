import { type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { SatelliteSelectionProvider } from '@/lib/satellite-selection';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SatelliteSelectionProvider>{children}</SatelliteSelectionProvider>
    </AuthProvider>
  );
}
