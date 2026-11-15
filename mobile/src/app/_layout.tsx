import '@/global.css';
import { Stack } from 'expo-router';
import { AppShell } from '@/components/app-shell';
import { AppProviders } from '@/components/app-providers';
import { useAtlasTheme } from '@/components/atlas-ui';

export default function RootLayout() {
  const { colors } = useAtlasTheme();
  return (
    <AppProviders>
      <AppShell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        />
      </AppShell>
    </AppProviders>
  );
}
