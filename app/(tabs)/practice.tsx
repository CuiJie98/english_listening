import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisodes } from '../../src/services/apiClient';
import type { EpisodeSummary } from '../../src/types/episode';

export default function PracticeScreen() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEpisodes(1, 50)
      .then((data) => setEpisodes(data.episodes.filter((e) => e.has_transcript)))
      .catch((err) => setError(err?.message || 'Failed to load episodes'))
      .finally(() => setLoading(false));
  }, []);

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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shadowing Practice</Text>
      <Text style={styles.subtitle}>
        Listen to the original, then record yourself
      </Text>

      {episodes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No episodes with text available</Text>
        </View>
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.episodeCard}
              onPress={() => router.push(`/player/${item.id}`)}
            >
              <Text style={styles.episodeTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.episodeArrow}>&#8594;</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.episodeList}
        />
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
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
