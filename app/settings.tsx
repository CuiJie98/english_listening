import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../src/constants/theme';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.hint}>Coming soon: playback speed, cache management, export data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
