import '@/global.css';
import { Stack } from 'expo-router';
import { AppShell } from '@/components/app-shell';
import { AppProviders } from '@/components/app-providers';

export default function RootLayout() {
  return (
    <AppProviders>
      <AppShell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#f4f7f4' },
          }}
        />
      </AppShell>
    </AppProviders>
  );
}
