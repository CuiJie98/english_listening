import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fontSize, borderRadius } from '../src/constants/theme';

const SPEED_KEY = 'playback_speed';
const SPEED_OPTIONS = [0.75, 1.0, 1.25];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [speed, setSpeed] = useState(1.0);

  useEffect(() => {
    AsyncStorage.getItem(SPEED_KEY).then((v) => {
      if (v) setSpeed(parseFloat(v));
    });
  }, []);

  const handleSpeedChange = async (s: number) => {
    setSpeed(s);
    await AsyncStorage.setItem(SPEED_KEY, s.toString());
  };

  const handleClearHistory = () => {
    Alert.alert('Clear History', 'Delete all practice attempts and recordings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await db.execAsync('DELETE FROM attempts');
          Alert.alert('Done', 'Practice history cleared.');
        },
      },
    ]);
  };

  const handleClearVocab = () => {
    Alert.alert('Clear Vocabulary', 'Delete all saved vocabulary cards?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await db.execAsync('DELETE FROM review_state');
          await db.execAsync('DELETE FROM vocab_cards');
          Alert.alert('Done', 'Vocabulary cleared.');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
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

      <Text style={styles.sectionTitle}>Data</Text>
      <TouchableOpacity style={styles.dangerButton} onPress={handleClearHistory}>
        <Text style={styles.dangerButtonText}>Clear Practice History</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.dangerButton, { marginTop: spacing.sm }]} onPress={handleClearVocab}>
        <Text style={styles.dangerButtonText}>Clear All Vocabulary</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.aboutText}>6 Min English Practice App</Text>
      <Text style={styles.aboutText}>Content from BBC Learning English</Text>
      <Text style={styles.aboutText}>Audio downloads are cached by the system.</Text>
    </View>
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
    marginBottom: spacing.sm,
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
  dangerButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerButtonText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  aboutText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
});
