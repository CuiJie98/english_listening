import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisodes } from '../../src/database/queries';
import { syncEpisodes } from '../../src/services/syncService';
import type { EpisodeSummary } from '../../src/types/episode';

export default function EpisodesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEpisodes = useCallback(async () => {
    const data = await getEpisodes(db);
    setEpisodes(data);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncEpisodes(db);
      await loadEpisodes();
    } catch {
      // silent fail on refresh
    }
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
        {item.duration_sec && (
          <Text style={styles.metaText}>{formatDuration(item.duration_sec)}</Text>
        )}
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

  return (
    <View style={styles.container}>
      {episodes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No episodes yet</Text>
          <Text style={styles.emptyHint}>Pull down to sync from BBC</Text>
        </View>
      ) : (
        <FlashList
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
});
