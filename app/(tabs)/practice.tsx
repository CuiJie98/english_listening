import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisodes } from '../../src/database/queries';
import type { EpisodeSummary } from '../../src/types/episode';

export default function PracticeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);

  const loadEpisodes = useCallback(async () => {
    const data = await getEpisodes(db);
    setEpisodes(data.filter((e) => e.has_transcript));
  }, [db]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shadowing Practice</Text>
      <Text style={styles.subtitle}>
        Listen to the original, then record yourself
      </Text>

      {episodes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No episodes with text available</Text>
          <Text style={styles.emptyHint}>
            Sync episodes and wait for transcripts to be fetched
          </Text>
        </View>
      ) : (
        <View style={styles.episodeList}>
          {episodes.slice(0, 10).map((ep) => (
            <TouchableOpacity
              key={ep.id}
              style={styles.episodeCard}
              onPress={() => router.push(`/player/${ep.id}`)}
            >
              <Text style={styles.episodeTitle} numberOfLines={1}>
                {ep.title}
              </Text>
              <Text style={styles.episodeArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  episodeList: {
    gap: spacing.sm,
  },
  episodeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  episodeTitle: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    marginRight: spacing.sm,
  },
  episodeArrow: {
    fontSize: fontSize.lg,
    color: colors.primary,
  },
});
