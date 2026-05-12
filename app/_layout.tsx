import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
