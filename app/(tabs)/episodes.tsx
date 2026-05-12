import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisodes } from '../../src/services/apiClient';
import type { EpisodeSummary } from '../../src/types/episode';

export default function EpisodesScreen() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadEpisodes = useCallback(async () => {
    try {
      setError('');
      const data = await getEpisodes(1, 50);
      setEpisodes(data.episodes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEpisodes();
    setRefreshing(false);
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  };

  const renderEpisode = ({ item }: { item: EpisodeSummary }) => (
    <TouchableOpacity
      style={styles.episodeCard}
      onPress={() => router.push(`/episode/${item.id}`)}
    >
      <View style={styles.episodeHeader}>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.badges}>
          {item.has_transcript && (
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeText}>Text</Text>
            </View>
          )}
          {!item.has_transcript && item.fetch_status === 'failed' && (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={styles.badgeText}>No Text</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.episodeMeta}>
        <Text style={styles.metaText}>{formatDate(item.published_at)}</Text>
        {item.duration_sec ? (
          <Text style={styles.metaText}>{formatDuration(item.duration_sec)}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

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
        <TouchableOpacity style={styles.retryButton} onPress={loadEpisodes}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {episodes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No episodes yet</Text>
          <Text style={styles.emptyHint}>Pull down to refresh</Text>
        </View>
      ) : (
        <FlatList
          data={episodes}
          renderItem={renderEpisode}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  list: {
    padding: spacing.md,
  },
  episodeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  episodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  episodeTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  badgeSuccess: {
    backgroundColor: colors.successLight,
  },
  badgeWarning: {
    backgroundColor: colors.warningLight,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  episodeMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
