import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '../src/constants/theme';

function BackButton() {
  const router = useRouter();
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };
  return (
    <TouchableOpacity style={styles.backButton} onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Text style={styles.backIcon}>{'‹'}</Text>
    </TouchableOpacity>
  );
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="episode/[id]"
          options={{
            headerShown: true,
            title: 'Episode',
            presentation: 'card',
            headerLeft: () => <BackButton />,
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text, fontWeight: '600' },
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            title: 'Settings',
            presentation: 'modal',
            headerLeft: () => <BackButton />,
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text, fontWeight: '600' },
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    color: colors.primary,
    fontWeight: '300',
  },
});
