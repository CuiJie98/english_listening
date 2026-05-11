import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initDatabase } from '../src/database/schema';
import { config } from '../src/constants/config';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={config.dbName} onInit={initDatabase}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="episode/[id]"
          options={{ headerShown: true, title: 'Episode', presentation: 'card' }}
        />
        <Stack.Screen
          name="player/[id]"
          options={{ headerShown: true, title: 'Practice', presentation: 'card' }}
        />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: 'Settings', presentation: 'modal' }}
        />
      </Stack>
    </SQLiteProvider>
  );
}
