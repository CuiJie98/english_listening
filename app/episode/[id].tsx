import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisode, insertVocabCard } from '../../src/database/queries';
import { downloadEpisodeAudio } from '../../src/services/audioCache';
import type { Episode } from '../../src/types/episode';

export default function EpisodeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Vocab save modal
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedContext, setSelectedContext] = useState('');
  const [definition, setDefinition] = useState('');

  const loadEpisode = useCallback(async () => {
    if (!id) return;
    const ep = await getEpisode(db, parseInt(id, 10));
    setEpisode(ep);
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    loadEpisode();
  }, [loadEpisode]);

  const handleDownloadAudio = async () => {
    if (!episode || downloading) return;
    setDownloading(true);
    const uri = await downloadEpisodeAudio(db, episode.bbc_id, episode.audio_url);
    if (uri) {
      await loadEpisode();
    }
    setDownloading(false);
  };

  const handleWordLongPress = (word: string, context: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWord(word);
    setSelectedContext(context);
    setDefinition('');
    setSaveModalVisible(true);
  };

  const handleSaveWord = async () => {
    if (!episode || !selectedWord.trim()) return;
    await insertVocabCard(db, {
      word_or_phrase: selectedWord.trim(),
      context: selectedContext || null,
      definition: definition.trim() || null,
      episode_id: episode.id,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveModalVisible(false);
  };

  const handleSaveSentence = (sentence: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWord(sentence.trim());
    setSelectedContext(sentence.trim());
    setDefinition('');
    setSaveModalVisible(true);
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

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => router.push(`/player/${episode.id}`)}
        >
          <Text style={styles.playButtonText}>▶ Play & Practice</Text>
        </TouchableOpacity>

        {!episode.audio_local && (
          <TouchableOpacity
            style={[styles.downloadButton, downloading && styles.downloadButtonDisabled]}
            onPress={handleDownloadAudio}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.downloadButtonText}>⬇ Download</Text>
            )}
          </TouchableOpacity>
        )}
        {episode.audio_local && (
          <View style={styles.downloadedBadge}>
            <Text style={styles.downloadedText}>✓ Offline</Text>
          </View>
        )}
      </View>

      {episode.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{episode.description}</Text>
        </View>
      )}

      {/* Transcript */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.hintText}>Long-press to save words</Text>
        </View>
        {episode.transcript ? (
          <View style={styles.transcriptContainer}>
            {episode.transcript.split('\n').filter(Boolean).map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.transcriptLine}
                  onLongPress={() => {
                    const words = trimmed.split(/\s+/);
                    if (words.length > 0) {
                      handleWordLongPress(words[0], trimmed);
                    }
                  }}
                  delayLongPress={500}
                >
                  <Text style={styles.transcriptText}>{trimmed}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.noTranscript}>
            <Text style={styles.noTranscriptText}>
              {episode.fetch_status === 'failed'
                ? 'Transcript unavailable'
                : 'Fetching transcript...'}
            </Text>
          </View>
        )}
      </View>

      {/* Save Word Modal */}
      <Modal visible={saveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save to Vocabulary</Text>

            <Text style={styles.modalLabel}>Word / Phrase</Text>
            <TextInput
              style={styles.modalInput}
              value={selectedWord}
              onChangeText={setSelectedWord}
              placeholder="Enter word or phrase"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Definition (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={definition}
              onChangeText={setDefinition}
              placeholder="Add a definition"
              autoCapitalize="none"
            />

            {selectedContext ? (
              <>
                <Text style={styles.modalLabel}>Context</Text>
                <Text style={styles.modalContext}>"{selectedContext}"</Text>
              </>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setSaveModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveWord}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  playButton: {
    flex: 1,
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
  downloadButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  downloadedBadge: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    justifyContent: 'center',
  },
  downloadedText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  hintText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
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
    paddingVertical: spacing.xs + 2,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  modalContext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalCancel: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  modalSave: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalSaveText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
