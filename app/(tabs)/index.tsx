import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getStats, getEpisodes, type Stats } from '../../src/services/apiClient';
import type { EpisodeSummary } from '../../src/types/episode';

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [latestEpisode, setLatestEpisode] = useState<EpisodeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = () => {
    setLoading(true);
    setError('');
    Promise.all([
      getStats(),
      getEpisodes(1, 1),
    ]).then(([s, epData]) => {
      setStats(s);
      setLatestEpisode(epData.episodes.length > 0 ? epData.episodes[0] : null);
      setLoading(false);
    }).catch((err) => {
      setError(err?.message || 'Failed to load data');
      setLoading(false);
    });
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>6 Min English</Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.settingsIcon}>&#9881;</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>BBC Learning English</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.streak ?? 0}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.totalEpisodes ?? 0}</Text>
          <Text style={styles.statLabel}>Episodes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.dueCount ?? 0}</Text>
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
          <Text style={styles.playHint}>Tap to listen</Text>
        </TouchableOpacity>
      )}

      {(stats?.dueCount ?? 0) > 0 && (
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => router.push('/(tabs)/vocab')}
        >
          <Text style={styles.reviewButtonText}>Review {stats!.dueCount} Cards</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  settingsIcon: { fontSize: 24 },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    fontSize: fontSize.xl,
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
  playHint: { color: colors.primaryLight, fontSize: fontSize.sm },
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
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
