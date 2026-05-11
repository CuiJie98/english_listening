import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getDueReviewCount, getStreakDays, getEpisodes } from '../../src/database/queries';
import { syncEpisodes, type SyncProgress } from '../../src/services/syncService';
import type { EpisodeSummary } from '../../src/types/episode';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [dueCount, setDueCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [latestEpisode, setLatestEpisode] = useState<EpisodeSummary | null>(null);
  const [syncState, setSyncState] = useState<SyncProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [due, streakDays, episodes] = await Promise.all([
      getDueReviewCount(db),
      getStreakDays(db),
      getEpisodes(db),
    ]);
    setDueCount(due);
    setStreak(streakDays);
    setLatestEpisode(episodes.length > 0 ? episodes[0] : null);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    if (syncState?.status === 'fetching_feed' || syncState?.status === 'syncing') return;
    try {
      await syncEpisodes(db, (p) => setSyncState({ ...p }));
      await loadData();
    } catch {
      // error handled by syncState.status
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>6 Min English</Text>
      <Text style={styles.subtitle}>BBC Learning English</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{dueCount}</Text>
          <Text style={styles.statLabel}>Due Review</Text>
        </View>
      </View>

      {latestEpisode && (
        <TouchableOpacity
          style={styles.latestCard}
          onPress={() => router.push(`/episode/${latestEpisode.id}`)}
        >
          <Text style={styles.latestLabel}>Latest Episode</Text>
          <Text style={styles.latestTitle} numberOfLines={2}>
            {latestEpisode.title}
          </Text>
          <Text style={styles.playHint}>Tap to listen →</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.syncButton} onPress={handleSync}>
        {syncState?.status === 'fetching_feed' || syncState?.status === 'syncing' ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={styles.syncButtonText}>Sync New Episodes</Text>
        )}
      </TouchableOpacity>

      {syncState && syncState.status !== 'idle' && (
        <Text style={styles.syncStatus}>
          {syncState.status === 'done'
            ? `Done! ${syncState.newEpisodes} new, ${syncState.transcriptsFetched} transcripts`
            : syncState.status === 'error'
              ? 'Sync failed. Check your connection.'
              : `Syncing... ${syncState.processed}/${syncState.total}`}
        </Text>
      )}

      {dueCount > 0 && (
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => router.push('/(tabs)/vocab')}
        >
          <Text style={styles.reviewButtonText}>Review {dueCount} Cards</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  latestCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  latestLabel: {
    color: colors.primaryLight,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  latestTitle: {
    color: colors.surface,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  playHint: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
  },
  syncButton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  syncButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  syncStatus: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginBottom: spacing.md,
  },
  reviewButton: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  reviewButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
