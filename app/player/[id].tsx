import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getEpisode, insertAttempt, insertVocabCard } from '../../src/database/queries';
import type { Episode } from '../../src/types/episode';

type Mode = 'listen' | 'record' | 'compare';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('listen');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(true);
  const [recordStartTime, setRecordStartTime] = useState(0);
  const [saved, setSaved] = useState(false);

  // Vocab save modal
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [definition, setDefinition] = useState('');

  // Player for original audio
  const player = useAudioPlayer(
    episode ? (episode.audio_local || episode.audio_url) : undefined,
    { updateInterval: 250 }
  );
  const playerStatus = useAudioPlayerStatus(player);

  // Recorder
  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY,
    (status) => {
      if (status.isFinished && status.url) {
        setRecordingUri(status.url);
        setMode('compare');
      }
    }
  );
  const recorderState = useAudioRecorderState(recorder);

  const loadEpisode = useCallback(async () => {
    if (!id) return;
    const ep = await getEpisode(db, parseInt(id, 10));
    setEpisode(ep);
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    loadEpisode();
  }, [loadEpisode]);

  const formatTime = (seconds: number) => {
    const totalSec = Math.floor(seconds);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.play();
  };

  const handlePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.pause();
  };

  const handleStartRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    player.pause();
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordStartTime(Date.now());
    setMode('record');
    setSaved(false);
  };

  const handleStopRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await recorder.stop();
  };

  const handlePlayRecording = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!recordingUri) return;
    player.replace(recordingUri);
    player.play();
  };

  const handlePlayOriginal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!episode) return;
    player.replace(episode.audio_local || episode.audio_url);
    player.play();
  };

  const handleSaveAttempt = async () => {
    if (!episode || !recordingUri) return;
    await insertAttempt(db, {
      episode_id: episode.id,
      type: 'shadow',
      recording_uri: recordingUri,
      duration_ms: Date.now() - recordStartTime,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
  };

  const handleReset = () => {
    if (episode) {
      player.replace(episode.audio_local || episode.audio_url);
    }
    setMode('listen');
    setRecordingUri(null);
    setSaved(false);
  };

  const handleSaveWord = async () => {
    if (!episode || !selectedWord.trim()) return;
    await insertVocabCard(db, {
      word_or_phrase: selectedWord.trim(),
      context: episode.transcript || null,
      definition: definition.trim() || null,
      episode_id: episode.id,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveModalVisible(false);
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
        <Text>Episode not found</Text>
      </View>
    );
  }

  const progress = playerStatus.duration > 0
    ? playerStatus.currentTime / playerStatus.duration
    : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={2}>{episode.title}</Text>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(playerStatus.currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(playerStatus.duration)}</Text>
      </View>

      {/* Playback controls */}
      <View style={styles.controlRow}>
        {playerStatus.playing ? (
          <TouchableOpacity style={styles.controlButton} onPress={handlePause}>
            <Text style={styles.controlIcon}>⏸</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.controlButton} onPress={handlePlay}>
            <Text style={styles.controlIcon}>▶️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mode-specific section */}
      {mode === 'listen' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.recordStartButton} onPress={handleStartRecording}>
            <Text style={styles.recordStartIcon}>🎤</Text>
            <Text style={styles.recordStartText}>Start Shadowing</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'record' && (
        <View style={styles.section}>
          <Text style={styles.recordLabel}>
            {recorderState.isRecording ? 'Recording...' : 'Preparing...'}
          </Text>
          <TouchableOpacity
            style={[styles.recordButton, styles.recordButtonActive]}
            onPress={handleStopRecording}
          >
            <Text style={styles.recordIcon}>⏹</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'compare' && (
        <View style={styles.section}>
          <Text style={styles.compareLabel}>Compare your recording</Text>
          <View style={styles.compareRow}>
            <TouchableOpacity style={styles.compareButton} onPress={handlePlayOriginal}>
              <Text style={styles.compareButtonText}>▶ Original</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.compareButton} onPress={handlePlayRecording}>
              <Text style={styles.compareButtonText}>▶ Mine</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveButton, saved && styles.saveButtonSaved]}
              onPress={handleSaveAttempt}
              disabled={saved}
            >
              <Text style={styles.saveButtonText}>{saved ? '✓ Saved' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Transcript & vocab */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.transcriptToggle}
          onPress={() => setShowTranscript(!showTranscript)}
        >
          <Text style={styles.transcriptToggleText}>
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </Text>
        </TouchableOpacity>

        {episode.transcript && (
          <TouchableOpacity
            style={styles.vocabButton}
            onPress={() => setSaveModalVisible(true)}
          >
            <Text style={styles.vocabButtonText}>+ Save Word</Text>
          </TouchableOpacity>
        )}
      </View>

      {showTranscript && episode.transcript && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptText} numberOfLines={6}>
            {episode.transcript}
          </Text>
        </View>
      )}

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
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIcon: {
    fontSize: 28,
  },
  section: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  recordStartButton: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordStartIcon: {
    fontSize: 24,
  },
  recordStartText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  recordLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: colors.text,
  },
  recordIcon: {
    fontSize: 32,
  },
  compareLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  compareRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  compareButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  compareButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  saveButtonSaved: {
    backgroundColor: colors.success,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  retryButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  retryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  transcriptToggle: {
    paddingVertical: spacing.sm,
  },
  transcriptToggleText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  vocabButton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  vocabButtonText: {
    color: colors.surface,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  transcriptBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flex: 1,
  },
  transcriptText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 22,
  },
  // Modal
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
