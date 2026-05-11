import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisode, insertVocabCard } from '../../src/database/queries';
import type { Episode } from '../../src/types/episode';

export default function EpisodeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');

  const loadEpisode = useCallback(async () => {
    if (!id) return;
    const ep = await getEpisode(db, parseInt(id, 10));
    setEpisode(ep);
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    loadEpisode();
  }, [loadEpisode]);

  const handleSaveWord = async (word: string, context: string) => {
    if (!episode) return;
    await insertVocabCard(db, {
      word_or_phrase: word,
      context,
      definition: null,
      episode_id: episode.id,
    });
    setSaveMsg(`Saved "${word}"`);
    setTimeout(() => setSaveMsg(''), 2000);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!episode) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Episode not found</Text>
      </View>
    );
  }

  const formatDate = (ts: number | null) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{episode.title}</Text>
      <Text style={styles.date}>{formatDate(episode.published_at)}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => router.push(`/player/${episode.id}`)}
        >
          <Text style={styles.playButtonText}>▶ Play & Practice</Text>
        </TouchableOpacity>
      </View>

      {episode.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{episode.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transcript</Text>
        {episode.transcript ? (
          <View style={styles.transcriptContainer}>
            {episode.transcript.split('\n').filter(Boolean).map((line, i) => (
              <TouchableOpacity
                key={i}
                style={styles.transcriptLine}
                onLongPress={() => {
                  const words = line.trim().split(/\s+/);
                  if (words.length > 0) {
                    handleSaveWord(words[0], line.trim());
                  }
                }}
              >
                <Text style={styles.transcriptText}>{line.trim()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noTranscript}>
            <Text style={styles.noTranscriptText}>
              {episode.fetch_status === 'failed'
                ? 'Transcript unavailable for this episode'
                : 'Transcript is being fetched...'}
            </Text>
          </View>
        )}
      </View>

      {saveMsg ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{saveMsg}</Text>
        </View>
      ) : null}
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
    marginBottom: spacing.xs,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  actionRow: {
    marginBottom: spacing.lg,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  playButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  transcriptContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  transcriptLine: {
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  transcriptText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 24,
  },
  noTranscript: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  noTranscriptText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
  },
  toast: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    backgroundColor: colors.success,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  toastText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
