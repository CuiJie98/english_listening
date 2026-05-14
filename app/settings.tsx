import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../src/constants/theme';
import { SPEED_OPTIONS } from '../src/constants/config';
import { getPlaybackSpeed, setPlaybackSpeed } from '../src/services/storage';

export default function SettingsScreen() {
  const [speed, setSpeed] = useState(1.0);

  useEffect(() => {
    getPlaybackSpeed().then(setSpeed).catch(() => setSpeed(1.0));
  }, []);

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    setPlaybackSpeed(s).catch(() => {});
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Playback Speed</Text>
      <View style={styles.speedRow}>
        {SPEED_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.speedButton, speed === s && styles.speedButtonActive]}
            onPress={() => handleSpeedChange(s)}
          >
            <Text style={[styles.speedText, speed === s && styles.speedTextActive]}>
              {s}x
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.aboutText}>6 Min English Practice App</Text>
      <Text style={styles.aboutText}>Content from BBC Learning English</Text>
      <Text style={styles.aboutText}>Backend auto-syncs new episodes every 6 hours</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  speedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  speedButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  speedText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  speedTextActive: {
    color: colors.surface,
  },
  aboutText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
});
