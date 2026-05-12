import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisode, insertVocabCard } from '../../src/services/apiClient';
import type { Episode } from '../../src/types/episode';

export default function EpisodeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedContext, setSelectedContext] = useState('');
  const [definition, setDefinition] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEpisode = useCallback(async () => {
    if (!id) return;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      setError('Invalid episode ID');
      setLoading(false);
      return;
    }
    try {
      const ep = await getEpisode(numId);
      setEpisode(ep);
    } catch (err: any) {
      setError(err?.message || 'Failed to load episode');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEpisode();
  }, [loadEpisode]);

  const handleWordLongPress = (word: string, context: string) => {
    setSelectedWord(word);
    setSelectedContext(context);
    setDefinition('');
    setSaveModalVisible(true);
  };

  const handleSaveWord = async () => {
    if (!episode || !selectedWord.trim()) return;
    setSaving(true);
    try {
      await insertVocabCard({
        word_or_phrase: selectedWord.trim(),
        context: selectedContext || undefined,
        definition: definition.trim() || undefined,
        episode_id: episode.id,
      });
      Alert.alert('Saved', `"${selectedWord.trim()}" added to vocabulary.`);
      setSaveModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save word');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !episode) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Episode not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadEpisode}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
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
          <Text style={styles.playButtonText}>Play & Practice</Text>
        </TouchableOpacity>
      </View>

      {episode.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{episode.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.hintText}>Long-press a line to save words</Text>
        </View>
        {episode.transcript_segments && episode.transcript_segments.length > 0 ? (
          <View style={styles.transcriptContainer}>
            {episode.transcript_segments.map((seg, i) => (
              <TouchableOpacity
                key={i}
                style={styles.transcriptLine}
                onLongPress={() => handleWordLongPress(seg.text.split(/\s+/)[0] || seg.text, seg.text)}
                delayLongPress={500}
              >
                {seg.speaker ? (
                  <Text style={styles.transcriptText}>
                    <Text style={styles.transcriptSpeaker}>{seg.speaker}: </Text>
                    {seg.text}
                  </Text>
                ) : (
                  <Text style={styles.transcriptText}>{seg.text}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : episode.transcript ? (
          <View style={styles.transcriptContainer}>
            {episode.transcript.split('\n').filter(Boolean).map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.transcriptLine}
                  onLongPress={() => handleWordLongPress(trimmed.split(/\s+/)[0] || trimmed, trimmed)}
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
                <Text style={styles.modalContext}>&ldquo;{selectedContext}&rdquo;</Text>
              </>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setSaveModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && styles.modalSaveDisabled]}
                onPress={handleSaveWord}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Saving...' : 'Save'}</Text>
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
    padding: spacing.lg,
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
  transcriptSpeaker: {
    fontWeight: '700',
    color: colors.primary,
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
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
