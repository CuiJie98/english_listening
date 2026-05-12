import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { SPEED_OPTIONS } from '../../src/constants/config';
import { getEpisode, insertAttempt, insertVocabCard, getAudioUrl } from '../../src/services/apiClient';
import { WebAudioPlayer } from '../../src/components/WebAudioPlayer';
import { WebAudioRecorder } from '../../src/components/WebAudioRecorder';
import type { Episode } from '../../src/types/episode';

type Mode = 'listen' | 'record' | 'compare';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('listen');
  const [showTranscript, setShowTranscript] = useState(true);
  const [saved, setSaved] = useState(false);
  const [recordStartTime, setRecordStartTime] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(1);

  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [definition, setDefinition] = useState('');

  const originalPlayerRef = useRef<WebAudioPlayer | null>(null);
  const recordingPlayerRef = useRef<WebAudioPlayer | null>(null);
  const recorderRef = useRef<WebAudioRecorder | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const activePlayerRef = useRef<'original' | 'recording'>('original');

  const getActivePlayer = () =>
    activePlayerRef.current === 'recording' ? recordingPlayerRef.current : originalPlayerRef.current;

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
    return () => {
      originalPlayerRef.current?.destroy();
      recordingPlayerRef.current?.destroy();
      recorderRef.current?.destroy();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  // Initialize original player when episode loads
  useEffect(() => {
    if (!episode) return;

    const savedRate = typeof window !== 'undefined' ? localStorage.getItem('playback_speed') : null;
    const rate = savedRate ? parseFloat(savedRate) : 1.0;
    setPlaybackRate(rate);

    const audioSrc = getAudioUrl(episode.bbc_id);
    const player = new WebAudioPlayer(audioSrc);
    player.setPlaybackRate(rate);

    player.onTimeUpdate((time) => {
      setCurrentTime(time);
      setIsPlaying(true);
    });
    player.onEnded(() => setIsPlaying(false));
    player.onLoaded(() => setDuration(player.getDuration()));

    originalPlayerRef.current = player;
    activePlayerRef.current = 'original';

    return () => {
      player.destroy();
    };
  }, [episode?.id]);

  const formatTime = (seconds: number) => {
    const totalSec = Math.floor(seconds);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    const player = getActivePlayer();
    if (!player) return;
    if (player.isPlaying()) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (fraction: number) => {
    const player = getActivePlayer();
    if (!player || !duration) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    player.seekTo(clamped * duration);
  };

  const handleSpeedCycle = () => {
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    originalPlayerRef.current?.setPlaybackRate(next);
    recordingPlayerRef.current?.setPlaybackRate(next);
    setPlaybackRate(next);
    if (typeof window !== 'undefined') localStorage.setItem('playback_speed', next.toString());
  };

  const switchToOriginal = () => {
    recordingPlayerRef.current?.pause();
    originalPlayerRef.current?.setPlaybackRate(playbackRate);
    activePlayerRef.current = 'original';
    setCurrentTime(originalPlayerRef.current?.getCurrentTime() || 0);
    setDuration(originalPlayerRef.current?.getDuration() || 0);
  };

  const switchToRecording = () => {
    originalPlayerRef.current?.pause();
    if (!recordingUrlRef.current) return;

    if (!recordingPlayerRef.current) {
      const recPlayer = new WebAudioPlayer(recordingUrlRef.current);
      recPlayer.setPlaybackRate(playbackRate);
      recPlayer.onTimeUpdate((t) => {
        if (activePlayerRef.current === 'recording') setCurrentTime(t);
      });
      recPlayer.onEnded(() => {
        if (activePlayerRef.current === 'recording') setIsPlaying(false);
      });
      recPlayer.onLoaded(() => {
        if (activePlayerRef.current === 'recording') setDuration(recPlayer.getDuration());
      });
      recordingPlayerRef.current = recPlayer;
    }
    activePlayerRef.current = 'recording';
    setCurrentTime(recordingPlayerRef.current.getCurrentTime() || 0);
    setDuration(recordingPlayerRef.current.getDuration() || 0);
  };

  const handleStartRecording = async () => {
    const recorder = new WebAudioRecorder();
    const ok = await recorder.requestPermission();
    if (!ok) {
      Alert.alert('Permission', 'Microphone permission is required for recording.');
      return;
    }

    originalPlayerRef.current?.pause();
    setIsPlaying(false);

    await recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordStartTime(Date.now());
    setMode('record');
    setSaved(false);
  };

  const handleStopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const blob = await recorder.stop();
    recorder.destroy();
    recorderRef.current = null;
    setIsRecording(false);

    // Clean up old recording
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingPlayerRef.current?.destroy();
    recordingPlayerRef.current = null;

    const url = URL.createObjectURL(blob);
    recordingUrlRef.current = url;
    setMode('compare');
    switchToOriginal();
  };

  const handlePlayRecording = () => {
    switchToRecording();
    recordingPlayerRef.current?.play();
    setIsPlaying(true);
  };

  const handlePlayOriginal = () => {
    switchToOriginal();
    originalPlayerRef.current?.play();
    setIsPlaying(true);
  };

  const handleSaveAttempt = async () => {
    if (!episode) return;
    try {
      await insertAttempt({
        episode_id: episode.id,
        type: 'shadow',
        duration_ms: Date.now() - recordStartTime,
      });
      setSaved(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save attempt');
    }
  };

  const handleReset = () => {
    recordingPlayerRef.current?.pause();
    originalPlayerRef.current?.pause();
    switchToOriginal();
    setMode('listen');
    setSaved(false);
    setCurrentTime(0);
    setIsPlaying(false);
    originalPlayerRef.current?.seekTo(0);
  };

  const handleOpenSaveWord = () => {
    setSelectedWord('');
    setDefinition('');
    setSaveModalVisible(true);
  };

  const handleSaveWord = async () => {
    if (!episode || !selectedWord.trim()) return;
    try {
      await insertVocabCard({
        word_or_phrase: selectedWord.trim(),
        context: episode.transcript || undefined,
        definition: definition.trim() || undefined,
        episode_id: episode.id,
      });
      Alert.alert('Saved', `"${selectedWord.trim()}" added to vocabulary.`);
      setSaveModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save word');
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

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={2}>{episode.title}</Text>

      {/* Progress bar */}
      <View
        style={styles.progressBar}
        onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
      >
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        <TouchableOpacity
          style={styles.progressTouch}
          onPress={(e) => {
            handleSeek(e.nativeEvent.locationX / progressBarWidth);
          }}
        />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* Playback controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity style={styles.controlButton} onPress={handlePlayPause}>
          <Text style={styles.controlIcon}>{isPlaying ? '||' : '>'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.speedButton} onPress={handleSpeedCycle}>
          <Text style={styles.speedText}>{playbackRate}x</Text>
        </TouchableOpacity>
      </View>

      {/* Mode-specific section */}
      {mode === 'listen' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.recordStartButton} onPress={handleStartRecording}>
            <Text style={styles.recordStartText}>Start Shadowing</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'record' && (
        <View style={styles.section}>
          <Text style={styles.recordLabel}>
            {isRecording ? 'Recording...' : 'Preparing...'}
          </Text>
          <TouchableOpacity
            style={[styles.recordButton, styles.recordButtonActive]}
            onPress={handleStopRecording}
          >
            <Text style={styles.recordIcon}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'compare' && (
        <View style={styles.section}>
          <Text style={styles.compareLabel}>Compare your recording</Text>
          <View style={styles.compareRow}>
            <TouchableOpacity
              style={[styles.compareButton, activePlayerRef.current === 'original' && styles.compareButtonActive]}
              onPress={handlePlayOriginal}
            >
              <Text style={styles.compareButtonText}>Original</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.compareButton, activePlayerRef.current === 'recording' && styles.compareButtonActive]}
              onPress={handlePlayRecording}
            >
              <Text style={styles.compareButtonText}>Mine</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveButton, saved && styles.saveButtonSaved]}
              onPress={handleSaveAttempt}
              disabled={saved}
            >
              <Text style={styles.saveButtonText}>{saved ? 'Saved' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryButtonSmall} onPress={handleReset}>
              <Text style={styles.retryButtonSmallText}>Try Again</Text>
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
            onPress={handleOpenSaveWord}
          >
            <Text style={styles.vocabButtonText}>+ Save Word</Text>
          </TouchableOpacity>
        )}
      </View>

      {showTranscript && (episode.transcript_segments?.length || episode.transcript) && (
        <View style={styles.transcriptBox}>
          {episode.transcript_segments && episode.transcript_segments.length > 0 ? (
            <Text style={styles.transcriptText} numberOfLines={6}>
              {episode.transcript_segments.map((seg) =>
                seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text
              ).join('\n')}
            </Text>
          ) : (
            <Text style={styles.transcriptText} numberOfLines={6}>
              {episode.transcript}
            </Text>
          )}
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
    padding: spacing.lg,
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
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  progressTouch: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    bottom: -10,
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
    alignItems: 'center',
    gap: spacing.md,
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
    color: colors.surface,
    fontWeight: '700',
  },
  speedButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
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
    fontSize: 16,
    color: colors.surface,
    fontWeight: '700',
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
  compareButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
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
  retryButtonSmall: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  retryButtonSmallText: {
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
