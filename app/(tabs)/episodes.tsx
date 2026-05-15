import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, TextInput } from 'react-native';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisodes, getAttempts, type AttemptWithEpisode } from '../../src/services/apiClient';
import { getFavoriteEpisodeIds } from '../../src/services/storage';
import type { EpisodeSummary } from '../../src/types/episode';

const PAGE_SIZE = 20;
type EpisodeFilter = 'all' | 'unlistened' | 'listened' | 'saved' | 'withText' | 'noText';

export default function EpisodesScreen() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [attempts, setAttempts] = useState<AttemptWithEpisode[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EpisodeFilter>('all');

  const listenedIds = useMemo(() => new Set(attempts.map((a) => a.episode_id)), [attempts]);
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const practicedIds = useMemo(
    () => new Set(attempts.filter((a) => a.type === 'shadow').map((a) => a.episode_id)),
    [attempts]
  );
  const visibleEpisodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return episodes.filter((episode) => {
      const hasTranscript = Boolean(episode.has_transcript);
      if (filter === 'listened' && !listenedIds.has(episode.id)) return false;
      if (filter === 'unlistened' && listenedIds.has(episode.id)) return false;
      if (filter === 'saved' && !favoriteIdSet.has(episode.id)) return false;
      if (filter === 'withText' && !hasTranscript) return false;
      if (filter === 'noText' && hasTranscript) return false;
      if (!needle) return true;
      return episode.title.toLowerCase().includes(needle);
    });
  }, [episodes, favoriteIdSet, filter, listenedIds, query]);

  const loadEpisodes = useCallback(async (nextPage = 1, append = false) => {
    try {
      setError('');
      const data = await getEpisodes(nextPage, PAGE_SIZE);
      setEpisodes((current) => append ? [...current, ...data.episodes] : data.episodes);
      setTotal(data.total);
      setPage(nextPage);
    } catch (err: any) {
      setError(err?.message || 'Failed to load episodes');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadAttempts = useCallback(async () => {
    try {
      const data = await getAttempts(8);
      setAttempts(data);
    } catch {}
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      setFavoriteIds(await getFavoriteEpisodeIds());
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    loadEpisodes();
    loadAttempts();
    loadFavorites();
  }, [loadEpisodes, loadAttempts, loadFavorites]);

  useFocusEffect(
    useCallback(() => {
      loadAttempts();
      loadFavorites();
    }, [loadAttempts, loadFavorites])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadEpisodes(1, false), loadAttempts(), loadFavorites()]);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (loadingMore || refreshing || episodes.length >= total) return;
    setLoadingMore(true);
    loadEpisodes(page + 1, true);
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

  const formatAttemptDuration = (ms: number | null) => {
    if (!ms) return '0:00';
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const renderEpisode = ({ item }: { item: EpisodeSummary }) => {
    const hasTranscript = Boolean(item.has_transcript);
    const listened = listenedIds.has(item.id);
    const practiced = practicedIds.has(item.id);
    const saved = favoriteIdSet.has(item.id);

    return (
      <TouchableOpacity
        style={styles.episodeCard}
        onPress={() => router.push(`/episode/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.episodeHeader}>
          <Text style={styles.episodeTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, listened ? styles.badgeListened : styles.badgeNeutral]}>
            <Text style={styles.badgeText}>{practiced ? 'Practiced' : listened ? 'Listened' : 'New'}</Text>
          </View>
          {saved ? (
            <View style={[styles.badge, styles.badgeSaved]}>
              <Text style={styles.badgeText}>Saved</Text>
            </View>
          ) : null}
          {hasTranscript ? (
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeText}>Text</Text>
            </View>
          ) : item.fetch_status === 'failed' ? (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={styles.badgeText}>No Text</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.episodeMeta}>
          <Text style={styles.metaText}>{formatDate(item.published_at)}</Text>
          {item.duration_sec ? (
            <Text style={styles.metaText}>{formatDuration(item.duration_sec)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
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
        <TouchableOpacity style={styles.retryButton} onPress={() => loadEpisodes()}>
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
          data={visibleEpisodes}
          renderItem={renderEpisode}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <>
              <View style={styles.filters}>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search episodes"
                  autoCapitalize="none"
                />
                <View style={styles.filterRow}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'unlistened', label: 'New' },
                    { key: 'listened', label: 'Listened' },
                    { key: 'saved', label: 'Saved' },
                    { key: 'withText', label: 'Text' },
                    { key: 'noText', label: 'No Text' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
                      onPress={() => setFilter(item.key as EpisodeFilter)}
                    >
                      <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {visibleEpisodes.length === 0 ? (
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyHint}>No episodes match this filter</Text>
                </View>
              ) : null}
              {attempts.length > 0 ? (
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Recent Practice</Text>
                {attempts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyCard}
                    onPress={() => router.push(`/episode/${item.episode_id}`)}
                  >
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyType}>
                        {item.type === 'shadow' ? 'Shadowing' : 'Listening'}
                      </Text>
                      <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
                    </View>
                    <Text style={styles.historyEpisode} numberOfLines={1}>
                      {item.episode_title || 'Episode'}
                    </Text>
                    <Text style={styles.historyDuration}>{formatAttemptDuration(item.duration_ms)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              ) : null}
            </>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.listFooter}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
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
  listFooter: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  filters: {
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  emptyInline: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
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
    flexWrap: 'wrap',
    marginTop: spacing.sm,
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
  badgeListened: {
    backgroundColor: colors.primaryLight + '30',
  },
  badgeSaved: {
    backgroundColor: colors.warningLight,
  },
  badgeNeutral: {
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.text,
  },
  episodeMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: spacing.sm,
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
  historySection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  historyType: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  historyEpisode: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  historyDuration: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
