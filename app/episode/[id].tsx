import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { createElement, useEffect, useState, useCallback, useRef } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { SPEED_OPTIONS } from '../../src/constants/config';
import { getEpisode, insertVocabCard, getAudioUrl, insertAttempt, getVocabCards, updateVocabCard } from '../../src/services/apiClient';
import {
  getPlaybackSpeed,
  setPlaybackSpeed,
  getPlaybackPosition,
  setPlaybackPosition,
  isFavoriteEpisode,
  toggleFavoriteEpisode,
} from '../../src/services/storage';
import {
  cleanTranscriptPhrase,
  cleanTranscriptWord,
  parseTranscriptMarkup,
  stripTranscriptMarkup,
} from '../../src/utils/transcriptMarkup';
import type { Episode } from '../../src/types/episode';

type Mode = 'listen' | 'record' | 'compare';
type ActivePlayer = 'original' | 'recording';
type EpisodeSection = 'transcript' | 'shadowing' | 'details';

function tokenizeTranscriptText(text: string): { text: string; hasTrailingSpace: boolean }[] {
  return (text.match(/\s+|\S+\s*/g) || []).map((piece) => {
    if (/^\s+$/.test(piece)) {
      return { text: ' ', hasTrailingSpace: false };
    }
    return {
      text: piece.replace(/\s+$/g, ''),
      hasTrailingSpace: /\s+$/.test(piece),
    };
  }).filter((token) => token.text.length > 0);
}

export default function EpisodeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Vocab modal
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedContext, setSelectedContext] = useState('');
  const [definition, setDefinition] = useState('');
  const [saving, setSaving] = useState(false);

  // Player state
  const [mode, setMode] = useState<Mode>('listen');
  const [activeSection, setActiveSection] = useState<EpisodeSection>('transcript');
  const [showTranscript, setShowTranscript] = useState(true);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordStartTime, setRecordStartTime] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>('original');
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [progressBarWidth, setProgressBarWidth] = useState(1);
  const listenSavedForEpisode = useRef<number | null>(null);
  const lastSavedPositionTime = useRef(0);
  const positionRestored = useRef(false);

  // Audio
  const originalPlayer = useAudioPlayer(
    episode ? { uri: getAudioUrl(episode.bbc_id) } : null,
    { updateInterval: 250 }
  );
  const recordingPlayer = useAudioPlayer(
    recordingUri ? { uri: recordingUri } : null,
    { updateInterval: 250 }
  );
  const originalStatus = useAudioPlayerStatus(originalPlayer);
  const recordingStatus = useAudioPlayerStatus(recordingPlayer);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const activeStatus = activePlayer === 'recording' ? recordingStatus : originalStatus;
  const currentTime = activeStatus.currentTime || 0;
  const duration = activeStatus.duration || 0;
  const isPlaying = activeStatus.playing;

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    originalPlayer.setPlaybackRate(rate);
    recordingPlayer.setPlaybackRate(rate);
  }, [originalPlayer, recordingPlayer]);

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

  useEffect(() => { loadEpisode(); }, [loadEpisode]);

  useEffect(() => {
    if (!episode) return;
    isFavoriteEpisode(episode.id)
      .then(setIsFavorite)
      .catch(() => setIsFavorite(false));
  }, [episode]);

  useEffect(() => {
    getPlaybackSpeed()
      .then((rate) => setPlaybackRate(rate))
      .catch(() => setPlaybackRate(1.0));
  }, [setPlaybackRate]);

  // Restore playback position
  useEffect(() => {
    if (!episode || positionRestored.current || !duration) return;
    positionRestored.current = true;
    getPlaybackPosition(episode.id).then((pos) => {
      if (pos > 0 && pos < duration - 2) {
        originalPlayer.seekTo(pos).catch(() => {});
      }
    });
  }, [episode, duration, originalPlayer]);

  // Periodically save playback position
  useEffect(() => {
    if (!episode || !isPlaying) return;
    const now = Date.now();
    if (now - lastSavedPositionTime.current < 5000) return;
    lastSavedPositionTime.current = now;
    setPlaybackPosition(episode.id, currentTime).catch(() => {});
  }, [episode, isPlaying, currentTime]);

  // Save position on unmount
  useEffect(() => {
    return () => {
      if (episode && currentTime > 0) {
        setPlaybackPosition(episode.id, currentTime).catch(() => {});
      }
    };
  }, [episode?.id]);

  useEffect(() => {
    if (!episode || activePlayer !== 'original' || !originalStatus.didJustFinish) return;
    if (listenSavedForEpisode.current === episode.id) return;
    listenSavedForEpisode.current = episode.id;
    insertAttempt({
      episode_id: episode.id,
      type: 'listen',
      duration_ms: Math.round((originalStatus.duration || 0) * 1000),
    }).catch(() => {});
  }, [activePlayer, episode, originalStatus.didJustFinish, originalStatus.duration]);

  const formatTime = (seconds: number) => {
    const totalSec = Math.floor(seconds);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const getActivePlayer = () => activePlayer === 'recording' ? recordingPlayer : originalPlayer;

  const handlePlayPause = () => {
    const player = getActivePlayer();
    if (activeStatus.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleSeek = (fraction: number) => {
    if (!duration) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    const target = clamped * duration;
    getActivePlayer().seekTo(target).catch(() => {});
    if (episode && activePlayer === 'original') {
      setPlaybackPosition(episode.id, target).catch(() => {});
    }
  };

  const handleSpeedCycle = () => {
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackRate(next);
    setPlaybackSpeed(next).catch(() => {});
  };

  const handleSkip = (seconds: number) => {
    if (!duration) return;
    const target = Math.max(0, Math.min(duration, currentTime + seconds));
    getActivePlayer().seekTo(target).catch(() => {});
    if (episode && activePlayer === 'original') {
      setPlaybackPosition(episode.id, target).catch(() => {});
    }
  };

  const switchToOriginal = () => {
    recordingPlayer.pause();
    originalPlayer.setPlaybackRate(playbackRate);
    setActivePlayer('original');
  };

  const switchToRecording = () => {
    originalPlayer.pause();
    if (!recordingUri) return;
    recordingPlayer.setPlaybackRate(playbackRate);
    setActivePlayer('recording');
  };

  const handleStartRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission', 'Microphone permission is required for recording.');
      return;
    }
    try {
      originalPlayer.pause();
      recordingPlayer.pause();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setActivePlayer('original');
      setMode('record');
      setActiveSection('shadowing');
      setSaved(false);
      setRecordingUri(null);
      setRecordStartTime(Date.now());
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setRecordingUri(recorder.uri);
      setMode('compare');
      switchToOriginal();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to stop recording');
    }
  };

  const handlePlayRecording = () => {
    if (!recordingUri) return;
    switchToRecording();
    recordingPlayer.play();
  };

  const handlePlayOriginal = () => {
    switchToOriginal();
    originalPlayer.play();
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
    recordingPlayer.pause();
    originalPlayer.pause();
    switchToOriginal();
    originalPlayer.seekTo(0).catch(() => {});
    setMode('listen');
    setSaved(false);
  };

  const handleToggleFavorite = async () => {
    if (!episode) return;
    try {
      const next = await toggleFavoriteEpisode(episode.id);
      setIsFavorite(next);
    } catch {
      Alert.alert('Error', 'Failed to update favorite status');
    }
  };

  // Vocab
  const handleWordTap = (word: string, context: string, isPhrase = false) => {
    const cleaned = isPhrase ? cleanTranscriptPhrase(word) : cleanTranscriptWord(word);
    if (!cleaned) return;
    setSelectedWord(cleaned);
    setSelectedContext(stripTranscriptMarkup(context));
    setDefinition('');
    setSaveModalVisible(true);
  };

  const handleWordLongPress = (context: string) => {
    setSelectedWord('');
    setSelectedContext(context);
    setDefinition('');
    setSaveModalVisible(true);
  };

  const handleSaveWord = async () => {
    if (!episode || !selectedWord.trim()) return;
    const word = selectedWord.trim();
    const context = selectedContext ? stripTranscriptMarkup(selectedContext) : undefined;
    const definitionValue = definition.trim() || undefined;
    setSaving(true);
    try {
      const existing = (await getVocabCards()).find(
        (card) => card.word_or_phrase.trim().toLowerCase() === word.toLowerCase()
      );

      if (existing) {
        Alert.alert('Already saved', `"${word}" is already in your vocabulary. Update its definition or context?`, [
          { text: 'Keep Existing', style: 'cancel' },
          {
            text: 'Update',
            onPress: async () => {
              try {
                await updateVocabCard(existing.id, {
                  word_or_phrase: word,
                  context,
                  definition: definitionValue,
                });
                setSaveModalVisible(false);
                Alert.alert('Updated', `"${word}" was updated.`);
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to update word');
              }
            },
          },
        ]);
        return;
      }

      await insertVocabCard({
        word_or_phrase: word,
        context,
        definition: definitionValue,
        episode_id: episode.id,
      });
      Alert.alert('Saved', `"${word}" added to vocabulary.`);
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

  const renderTextWithBold = (text: string, context: string) => {
    const parts = parseTranscriptMarkup(text);
    let key = 0;
    return parts.map((part) => {
      if (part.bold) {
        return renderTranscriptToken({
          key: key++,
          text: part.text,
          context,
          isPhrase: true,
          bold: true,
          hasTrailingSpace: false,
        });
      }
      return tokenizeTranscriptText(part.text).map((token) => {
        if (!token.text.trim()) {
          return renderTranscriptSpace(key++);
        }
        return renderTranscriptToken({
          key: key++,
          text: token.text,
          context,
          isPhrase: false,
          bold: false,
          hasTrailingSpace: token.hasTrailingSpace,
        });
      });
    });
  };

  const renderTranscriptToken = ({
    key,
    text,
    context,
    isPhrase,
    bold,
    hasTrailingSpace,
  }: {
    key: number;
    text: string;
    context: string;
    isPhrase: boolean;
    bold: boolean;
    hasTrailingSpace: boolean;
  }) => {
    const onPress = () => handleWordTap(text, context, isPhrase);
    const displayText = hasTrailingSpace ? `${text} ` : text;
    if (Platform.OS === 'web') {
      return createElement('span', {
        key,
        role: 'button',
        tabIndex: 0,
        'aria-label': `Save ${text}`,
        'data-transcript-token': text,
        'data-transcript-kind': isPhrase ? 'phrase' : 'word',
        onClick: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
          onPress();
        },
        onKeyDown: (event: { key?: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault?.();
            event.stopPropagation?.();
            onPress();
          }
        },
        style: {
          cursor: 'pointer',
          color: bold ? colors.primary : colors.text,
          fontWeight: bold ? 700 : 400,
          textDecorationLine: bold ? 'underline' : 'none',
          backgroundColor: bold ? colors.primaryLight + '18' : 'transparent',
        },
      }, displayText);
    }
    return (
      <Text
        key={key}
        style={[styles.wordTap, bold && styles.wordBold]}
        onPress={onPress}
      >
        {displayText}
      </Text>
    );
  };

  const renderTranscriptSpace = (key: number) => {
    if (Platform.OS === 'web') {
      return createElement('span', { key, style: { whiteSpace: 'pre' } }, ' ');
    }
    return <Text key={key}> </Text>;
  };

  const renderHighlightedContext = () => {
    const context = stripTranscriptMarkup(selectedContext);
    const phrase = selectedWord.trim();
    if (!context || !phrase) {
      return <Text style={styles.modalContext}>&ldquo;{context}&rdquo;</Text>;
    }

    const start = context.toLowerCase().indexOf(phrase.toLowerCase());
    if (start < 0) {
      return <Text style={styles.modalContext}>&ldquo;{context}&rdquo;</Text>;
    }

    const end = start + phrase.length;
    return (
      <Text style={styles.modalContext}>
        {'"'}
        {context.slice(0, start)}
        <Text style={styles.modalContextHighlight}>{context.slice(start, end)}</Text>
        {context.slice(end)}
        {'"'}
      </Text>
    );
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const transcriptLineCount = episode.transcript_segments && episode.transcript_segments.length > 0
    ? episode.transcript_segments.length
    : (episode.transcript || '').split('\n').filter((line) => line.trim()).length;

  const handleCycleHighlightedLine = () => {
    if (transcriptLineCount === 0) return;
    setHighlightedLine((current) => {
      if (current === null) return 0;
      if (current + 1 >= transcriptLineCount) return null;
      return current + 1;
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.playerPanel}>
        <View style={styles.titleRow}>
          <View style={styles.titleContent}>
            <Text style={styles.title}>{episode.title}</Text>
            <Text style={styles.date}>{formatDate(episode.published_at)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]}
            onPress={handleToggleFavorite}
          >
            <Text style={[styles.favoriteButtonText, isFavorite && styles.favoriteButtonTextActive]}>
              {isFavorite ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.progressBar}
          onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          <TouchableOpacity
            style={styles.progressTouch}
            onPress={(e) => handleSeek(e.nativeEvent.locationX / progressBarWidth)}
          />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.skipButton} onPress={() => handleSkip(-15)}>
            <Text style={styles.skipText}>-15</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => handleSkip(-3)}>
            <Text style={styles.skipText}>-3</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handlePlayPause}>
            <Text style={styles.controlIcon}>{isPlaying ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => handleSkip(3)}>
            <Text style={styles.skipText}>+3</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => handleSkip(15)}>
            <Text style={styles.skipText}>+15</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.speedRow}>
          <TouchableOpacity style={styles.speedButton} onPress={handleSpeedCycle}>
            <Text style={styles.speedText}>{playbackRate}x</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionTabs}>
        {[
          { key: 'transcript', label: 'Transcript' },
          { key: 'shadowing', label: 'Shadowing' },
          { key: 'details', label: 'Details' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}
            onPress={() => setActiveSection(tab.key as EpisodeSection)}
          >
            <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSection === 'shadowing' && mode === 'listen' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.recordStartButton} onPress={handleStartRecording}>
            <Text style={styles.recordStartText}>Start Shadowing</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeSection === 'shadowing' && mode === 'record' && (
        <View style={styles.section}>
          {recorderState.isRecording ? (
            <Text style={styles.recordLabel}>
              Recording... {formatTime(recorderState.durationMillis / 1000)}
            </Text>
          ) : (
            <View style={styles.preparingRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.recordLabel}>Preparing...</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.recordButton, styles.recordButtonActive]}
            onPress={handleStopRecording}
          >
            <Text style={styles.recordIcon}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeSection === 'shadowing' && mode === 'compare' && (
        <View style={styles.section}>
          <Text style={styles.compareLabel}>Compare your recording</Text>
          <View style={styles.compareRow}>
            <TouchableOpacity
              style={[styles.compareButton, activePlayer === 'original' && styles.compareButtonActive]}
              onPress={handlePlayOriginal}
            >
              <Text style={styles.compareButtonText}>Original</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.compareButton, activePlayer === 'recording' && styles.compareButtonActive, !recordingUri && styles.compareButtonDisabled]}
              onPress={handlePlayRecording}
              disabled={!recordingUri}
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

      {/* Description */}
      {activeSection === 'details' && episode.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{episode.description}</Text>
        </View>
      )}

      {/* Transcript */}
      {activeSection === 'transcript' && <View style={styles.section}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <View style={styles.transcriptActions}>
            {showTranscript && transcriptLineCount > 0 ? (
              <TouchableOpacity
                style={styles.transcriptToggle}
                onPress={handleCycleHighlightedLine}
              >
                <Text style={styles.transcriptToggleText}>
                  {highlightedLine === null ? 'Focus' : 'Next'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.transcriptToggle}
              onPress={() => setShowTranscript(!showTranscript)}
            >
              <Text style={styles.transcriptToggleText}>
                {showTranscript ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
            {episode.transcript && (
              <TouchableOpacity
                style={styles.vocabButton}
                onPress={() => {
                  setSelectedWord('');
                  setSelectedContext('');
                  setDefinition('');
                  setSaveModalVisible(true);
                }}
              >
                <Text style={styles.vocabButtonText}>+ Word</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {showTranscript && (
          <>
            <Text style={styles.hintText}>
              Tap a word or highlighted phrase to save it. Use Focus to mark a line.
            </Text>
            {episode.transcript_segments && episode.transcript_segments.length > 0 ? (
              <View style={styles.transcriptContainer}>
                {episode.transcript_segments.map((seg, i) => (
                  <View
                    key={i}
                    style={[styles.transcriptLine, highlightedLine === i && styles.transcriptLineActive]}
                  >
                    <Text style={styles.transcriptText}>
                      {seg.speaker && (
                        <Text style={styles.transcriptSpeaker}>{seg.speaker}: </Text>
                      )}
                      {renderTextWithBold(seg.text, seg.text)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : episode.transcript ? (
              <View style={styles.transcriptContainer}>
                {episode.transcript.split('\n').filter(Boolean).map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  return (
                    <View
                      key={i}
                      style={[styles.transcriptLine, highlightedLine === i && styles.transcriptLineActive]}
                    >
                      <Text style={styles.transcriptText}>
                        {renderTextWithBold(trimmed, trimmed)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noTranscript}>
                {episode.fetch_status === 'failed' ? (
                  <Text style={styles.noTranscriptText}>Transcript unavailable</Text>
                ) : (
                  <View style={styles.fetchingRow}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                    <Text style={styles.noTranscriptText}>Fetching transcript...</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>}

      {/* Vocab modal */}
      <Modal visible={saveModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSaveModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Save to Vocabulary</Text>

            <Text style={styles.modalLabel}>Word / Phrase</Text>
            <TextInput
              style={styles.modalInput}
              value={selectedWord}
              onChangeText={setSelectedWord}
              placeholder="Type the exact word or phrase"
              autoCapitalize="none"
              autoFocus
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
                {renderHighlightedContext()}
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
                style={[styles.modalSave, (saving || !selectedWord.trim()) && styles.modalSaveDisabled]}
                onPress={handleSaveWord}
                disabled={saving || !selectedWord.trim()}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleContent: {
    flex: 1,
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
  favoriteButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 64,
    alignItems: 'center',
  },
  favoriteButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  favoriteButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  favoriteButtonTextActive: {
    color: colors.surface,
  },
  // Player
  playerPanel: {
    backgroundColor: colors.background,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    ...(Platform.OS === 'web' ? {
      position: 'sticky' as any,
      top: 0,
      zIndex: 20,
    } : null),
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
    top: -20,
    left: 0,
    right: 0,
    bottom: -20,
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
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  skipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
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
    fontSize: fontSize.sm,
    color: colors.surface,
    fontWeight: '700',
  },
  speedRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  // Shadowing
  section: {
    marginBottom: spacing.lg,
  },
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  sectionTabActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  sectionTabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sectionTabTextActive: {
    color: colors.text,
  },
  recordStartButton: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignSelf: 'center',
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
    textAlign: 'center',
  },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
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
    textAlign: 'center',
  },
  compareRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
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
  compareButtonDisabled: {
    opacity: 0.4,
  },
  compareButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
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
  // Description
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  // Transcript
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  transcriptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  transcriptToggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
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
  hintText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  transcriptContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  transcriptLine: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  transcriptLineActive: {
    backgroundColor: colors.primaryLight + '18',
    borderBottomColor: colors.primaryLight,
  },
  transcriptText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 24,
  },
  transcriptSpeaker: {
    fontSize: fontSize.md,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  wordTap: {
    color: colors.text,
  },
  wordBold: {
    fontWeight: '700',
    color: colors.primary,
    textDecorationLine: 'underline',
    backgroundColor: colors.primaryLight + '18',
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
  fetchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Error
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
  modalContext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  modalContextHighlight: {
    color: colors.text,
    backgroundColor: colors.primaryLight + '30',
    fontWeight: '700',
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
