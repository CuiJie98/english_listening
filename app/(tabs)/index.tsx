import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getStats, getEpisodes, type Stats } from '../../src/services/apiClient';
import type { EpisodeSummary } from '../../src/types/episode';

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [latestEpisode, setLatestEpisode] = useState<EpisodeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [s, epData] = await Promise.all([
        getStats(),
        getEpisodes(1, 1),
      ]);
      setStats(s);
      setLatestEpisode(epData.episodes.length > 0 ? epData.episodes[0] : null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>6 Min English</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.settingsIcon}>&#9881;</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>BBC Learning English</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats ? stats.streak : '--'}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats ? stats.totalEpisodes : '--'}</Text>
          <Text style={styles.statLabel}>Episodes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats ? stats.dueCount : '--'}</Text>
          <Text style={styles.statLabel}>Due Review</Text>
        </View>
      </View>

      {latestEpisode ? (
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
      ) : (
        <View style={styles.latestCardEmpty}>
          <Text style={styles.latestCardEmptyText}>No episodes available yet</Text>
          <Text style={styles.latestCardEmptyHint}>Pull down to refresh</Text>
        </View>
      )}

      {(stats?.dueCount ?? 0) > 0 && (
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => router.push('/(tabs)/vocab')}
        >
          <Text style={styles.reviewButtonText}>Review {stats!.dueCount} Cards</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
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
  settingsButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
  latestCardEmpty: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  latestCardEmptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginBottom: spacing.xs,
  },
  latestCardEmptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
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
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.md,
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
