import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Platform, Pressable } from 'react-native';
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
import type { TranscriptSegment } from '../../src/types/episode';

type Mode = 'listen' | 'record' | 'compare';
type ActivePlayer = 'original' | 'recording';
type EpisodeSection = 'transcript' | 'shadowing' | 'details';
type PracticeMode = 'sentence' | 'full';
type RecordingScope = 'sentence' | 'full';
type SelfRating = 'again' | 'hard' | 'good' | 'easy';

const SELF_RATINGS: Array<{ key: SelfRating; label: string; score: number }> = [
  { key: 'again', label: 'Again', score: 45 },
  { key: 'hard', label: 'Hard', score: 65 },
  { key: 'good', label: 'Good', score: 82 },
  { key: 'easy', label: 'Easy', score: 95 },
];

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
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('sentence');
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [sentenceLoop, setSentenceLoop] = useState(false);
  const [sentencePlaybackActive, setSentencePlaybackActive] = useState(false);
  const [recordingScope, setRecordingScope] = useState<RecordingScope>('full');
  const [recordingDurationMs, setRecordingDurationMs] = useState<number | null>(null);
  const [selfRating, setSelfRating] = useState<SelfRating>('good');
  const [lastPracticeScore, setLastPracticeScore] = useState<number | null>(null);
  const [practicedSegments, setPracticedSegments] = useState<Set<number>>(() => new Set());
  const [recordStartTime, setRecordStartTime] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>('original');
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [progressBarWidth, setProgressBarWidth] = useState(1);
  const listenSavedForEpisode = useRef<number | null>(null);
  const lastSavedPositionTime = useRef(0);
  const positionRestored = useRef(false);
  const lastTokenTapAt = useRef(0);

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
    if (!episode?.transcript_segments) return;
    const firstTimedIndex = episode.transcript_segments.findIndex(hasSegmentTiming);
    setSelectedSegmentIndex((current) => {
      if (current !== null && hasSegmentTiming(episode.transcript_segments?.[current])) {
        return current;
      }
      return firstTimedIndex >= 0 ? firstTimedIndex : null;
    });
    setPracticeMode(firstTimedIndex >= 0 ? 'sentence' : 'full');
    setPracticedSegments(new Set());
    setLastPracticeScore(null);
    setRecordingDurationMs(null);
  }, [episode?.id]);

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

  useEffect(() => {
    if (!episode || !sentencePlaybackActive || activePlayer !== 'original') return;
    if (selectedSegmentIndex === null) return;
    const segment = episode.transcript_segments?.[selectedSegmentIndex];
    if (!hasSegmentTiming(segment)) return;
    if (currentTime < segment.end) return;
    if (sentenceLoop) {
      originalPlayer.seekTo(segment.start).then(() => originalPlayer.play()).catch(() => {});
    } else {
      originalPlayer.pause();
      setSentencePlaybackActive(false);
    }
  }, [activePlayer, currentTime, episode, originalPlayer, selectedSegmentIndex, sentenceLoop, sentencePlaybackActive]);

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

  const handleSegmentPress = (segment: TranscriptSegment, index: number) => {
    if (!hasSegmentTiming(segment)) return;
    if (Date.now() - lastTokenTapAt.current < 250) return;
    setSelectedSegmentIndex(index);
    setHighlightedLine(index);
    setSaved(false);
    setLastPracticeScore(null);
    switchToOriginal();
    setSentencePlaybackActive(false);
    originalPlayer.seekTo(segment.start).catch(() => {});
    if (episode) {
      setPlaybackPosition(episode.id, segment.start).catch(() => {});
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

  const handleStartRecording = async (scope: RecordingScope = 'full') => {
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
      setRecordingScope(scope);
      setActivePlayer('original');
      setMode('record');
      setActiveSection('shadowing');
      setSaved(false);
      setRecordingUri(null);
      setRecordingDurationMs(null);
      setLastPracticeScore(null);
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
      setRecordingDurationMs(Date.now() - recordStartTime);
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
    if (recordingScope === 'sentence' && selectedSegmentIndex !== null) {
      handlePlaySentence();
      return;
    }
    switchToOriginal();
    originalPlayer.play();
  };

  const handleSaveAttempt = async () => {
    if (!episode) return;
    const isSentencePractice = recordingScope === 'sentence';
    const segment = isSentencePractice && selectedSegmentIndex !== null
      ? episode.transcript_segments?.[selectedSegmentIndex]
      : null;
    const durationValue = recordingDurationMs ?? Date.now() - recordStartTime;
    const targetDurationMs = hasSegmentTiming(segment)
      ? Math.round((segment.end - segment.start) * 1000)
      : undefined;
    const score = isSentencePractice && targetDurationMs
      ? calculatePracticeScore(durationValue, targetDurationMs, selfRating)
      : undefined;
    try {
      await insertAttempt({
        episode_id: episode.id,
        type: 'shadow',
        duration_ms: durationValue,
        score,
        segment_index: hasSegmentTiming(segment) ? selectedSegmentIndex ?? undefined : undefined,
        segment_start_sec: hasSegmentTiming(segment) ? segment.start : undefined,
        segment_end_sec: hasSegmentTiming(segment) ? segment.end : undefined,
        segment_text: hasSegmentTiming(segment) ? stripTranscriptMarkup(segment.text) : undefined,
        self_rating: isSentencePractice ? selfRating : undefined,
      });
      if (isSentencePractice && selectedSegmentIndex !== null) {
        setPracticedSegments((current) => new Set(current).add(selectedSegmentIndex));
        setLastPracticeScore(score ?? null);
      }
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
    setRecordingDurationMs(null);
    setLastPracticeScore(null);
  };

  const handlePlaySentence = () => {
    if (!episode || selectedSegmentIndex === null) return;
    const segment = episode.transcript_segments?.[selectedSegmentIndex];
    if (!hasSegmentTiming(segment)) return;
    recordingPlayer.pause();
    originalPlayer.setPlaybackRate(playbackRate);
    setActivePlayer('original');
    setSentencePlaybackActive(true);
    originalPlayer.seekTo(segment.start).then(() => originalPlayer.play()).catch(() => {});
    setPlaybackPosition(episode.id, segment.start).catch(() => {});
  };

  const moveSelectedSentence = (direction: -1 | 1) => {
    if (!episode?.transcript_segments) return;
    const timedIndices = episode.transcript_segments
      .map((segment, index) => hasSegmentTiming(segment) ? index : -1)
      .filter((index) => index >= 0);
    if (timedIndices.length === 0) return;
    const currentPosition = Math.max(0, timedIndices.indexOf(selectedSegmentIndex ?? timedIndices[0]));
    const nextPosition = Math.max(0, Math.min(timedIndices.length - 1, currentPosition + direction));
    const nextIndex = timedIndices[nextPosition];
    setSelectedSegmentIndex(nextIndex);
    setHighlightedLine(nextIndex);
    setSaved(false);
    setLastPracticeScore(null);
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
    const onPress = () => {
      lastTokenTapAt.current = Date.now();
      handleWordTap(text, context, isPhrase);
    };
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
  const autoHighlightedLine = activePlayer === 'original' && episode.transcript_segments
    ? episode.transcript_segments.findIndex((seg) => (
        hasSegmentTiming(seg) &&
        currentTime >= seg.start &&
        currentTime < seg.end
      ))
    : -1;
  const effectiveHighlightedLine = selectedSegmentIndex ?? (autoHighlightedLine >= 0 ? autoHighlightedLine : highlightedLine);
  const hasAlignedTranscript = !!episode.transcript_segments?.some(hasSegmentTiming);
  const transcriptLineCount = episode.transcript_segments && episode.transcript_segments.length > 0
    ? episode.transcript_segments.length
    : (episode.transcript || '').split('\n').filter((line) => line.trim()).length;
  const timedSegmentIndices = episode.transcript_segments
    ? episode.transcript_segments
      .map((segment, index) => hasSegmentTiming(segment) ? index : -1)
      .filter((index) => index >= 0)
    : [];
  const canUseSentencePractice = timedSegmentIndices.length > 0;
  const selectedSegment = selectedSegmentIndex !== null
    ? episode.transcript_segments?.[selectedSegmentIndex]
    : null;
  const selectedSegmentPosition = selectedSegmentIndex !== null
    ? timedSegmentIndices.indexOf(selectedSegmentIndex) + 1
    : 0;
  const selectedSentenceText = selectedSegment ? stripTranscriptMarkup(selectedSegment.text) : '';
  const targetSentenceMs = hasSegmentTiming(selectedSegment)
    ? Math.round((selectedSegment.end - selectedSegment.start) * 1000)
    : 0;

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
          { key: 'shadowing', label: 'Practice' },
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
          {canUseSentencePractice ? (
            <View style={styles.practicePanel}>
              <View style={styles.practiceModeRow}>
                <TouchableOpacity
                  style={[styles.practiceModeButton, practiceMode === 'sentence' && styles.practiceModeButtonActive]}
                  onPress={() => setPracticeMode('sentence')}
                >
                  <Text style={[styles.practiceModeText, practiceMode === 'sentence' && styles.practiceModeTextActive]}>
                    Sentence
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.practiceModeButton, practiceMode === 'full' && styles.practiceModeButtonActive]}
                  onPress={() => setPracticeMode('full')}
                >
                  <Text style={[styles.practiceModeText, practiceMode === 'full' && styles.practiceModeTextActive]}>
                    Full episode
                  </Text>
                </TouchableOpacity>
              </View>

              {practiceMode === 'sentence' && hasSegmentTiming(selectedSegment) ? (
                <>
                  <View style={styles.sentenceCard}>
                    <View style={styles.sentenceMetaRow}>
                      <Text style={styles.sentenceMetaText}>
                        Sentence {selectedSegmentPosition}/{timedSegmentIndices.length}
                      </Text>
                      {selectedSegmentIndex !== null && practicedSegments.has(selectedSegmentIndex) ? (
                        <Text style={styles.practicedBadge}>Practiced</Text>
                      ) : null}
                    </View>
                    <Text style={styles.sentencePracticeText}>{selectedSentenceText}</Text>
                    <Text style={styles.sentenceTimeText}>
                      {formatTime(selectedSegment.start)} - {formatTime(selectedSegment.end)}
                    </Text>
                  </View>

                  <View style={styles.sentenceControls}>
                    <TouchableOpacity style={styles.sentenceToolButton} onPress={() => moveSelectedSentence(-1)}>
                      <Text style={styles.sentenceToolText}>Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sentenceToolButton} onPress={handlePlaySentence}>
                      <Text style={styles.sentenceToolText}>Play sentence</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sentenceToolButton, sentenceLoop && styles.sentenceToolButtonActive]}
                      onPress={() => setSentenceLoop((value) => !value)}
                    >
                      <Text style={[styles.sentenceToolText, sentenceLoop && styles.sentenceToolTextActive]}>
                        Loop
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sentenceToolButton} onPress={() => moveSelectedSentence(1)}>
                      <Text style={styles.sentenceToolText}>Next</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.recordStartButton} onPress={() => handleStartRecording('sentence')}>
                    <Text style={styles.recordStartText}>Record this sentence</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.recordStartButton} onPress={() => handleStartRecording('full')}>
                  <Text style={styles.recordStartText}>Start full shadowing</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.recordStartButton} onPress={() => handleStartRecording('full')}>
              <Text style={styles.recordStartText}>Start Shadowing</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {activeSection === 'shadowing' && mode === 'record' && (
        <View style={styles.section}>
          {recordingScope === 'sentence' && selectedSentenceText ? (
            <View style={styles.sentenceCard}>
              <Text style={styles.sentenceMetaText}>Recording sentence</Text>
              <Text style={styles.sentencePracticeText}>{selectedSentenceText}</Text>
            </View>
          ) : null}
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
          <Text style={styles.compareLabel}>
            {recordingScope === 'sentence' ? 'Compare this sentence' : 'Compare your recording'}
          </Text>
          {recordingScope === 'sentence' && selectedSentenceText ? (
            <View style={styles.sentenceCard}>
              <Text style={styles.sentenceMetaText}>
                Target {targetSentenceMs ? formatTime(targetSentenceMs / 1000) : ''}
              </Text>
              <Text style={styles.sentencePracticeText}>{selectedSentenceText}</Text>
            </View>
          ) : null}
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
          {recordingScope === 'sentence' ? (
            <>
              <Text style={styles.ratingLabel}>How did it feel?</Text>
              <View style={styles.ratingRow}>
                {SELF_RATINGS.map((rating) => (
                  <TouchableOpacity
                    key={rating.key}
                    style={[styles.ratingChip, selfRating === rating.key && styles.ratingChipActive]}
                    onPress={() => setSelfRating(rating.key)}
                  >
                    <Text style={[styles.ratingChipText, selfRating === rating.key && styles.ratingChipTextActive]}>
                      {rating.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {recordingDurationMs && targetSentenceMs ? (
                <View style={styles.scorePreview}>
                  <Text style={styles.scorePreviewText}>
                    Timing score {calculatePracticeScore(recordingDurationMs, targetSentenceMs, selfRating)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
          {lastPracticeScore !== null ? (
            <View style={styles.scorePreview}>
              <Text style={styles.scorePreviewText}>Practice score {lastPracticeScore}</Text>
            </View>
          ) : null}
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
              Tap words to save them. Timed paragraphs follow audio and can seek playback.
            </Text>
            {hasAlignedTranscript ? (
              <View style={styles.alignmentMetaRow}>
                <Text style={styles.alignmentMetaText}>Aligned transcript</Text>
              </View>
            ) : null}
            {episode.transcript_segments && episode.transcript_segments.length > 0 ? (
              <View style={styles.transcriptContainer}>
                {episode.transcript_segments.map((seg, i) => {
                  const timed = hasSegmentTiming(seg);
                  const lineStyle = [
                    styles.transcriptLine,
                    timed && styles.transcriptLineTimed,
                    effectiveHighlightedLine === i && styles.transcriptLineActive,
                    autoHighlightedLine === i && styles.transcriptLineAuto,
                    selectedSegmentIndex === i && styles.transcriptLineSelected,
                  ];
                  const content = (
                    <View style={styles.transcriptLineContent}>
                      <Text style={styles.transcriptText}>
                        {seg.speaker && (
                          <Text style={styles.transcriptSpeaker}>{seg.speaker}: </Text>
                        )}
                        {renderTextWithBold(seg.text, seg.text)}
                      </Text>
                      {timed ? (
                        <Text style={styles.segmentTime}>{formatTime(seg.start)}</Text>
                      ) : null}
                    </View>
                  );

                  if (!timed) {
                    return (
                      <View key={i} style={lineStyle}>
                        {content}
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={i}
                      onPress={() => handleSegmentPress(seg, i)}
                      style={lineStyle}
                    >
                      {content}
                    </Pressable>
                  );
                })}
              </View>
            ) : episode.transcript ? (
              <View style={styles.transcriptContainer}>
                {episode.transcript.split('\n').filter(Boolean).map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  return (
                    <View
                      key={i}
                      style={[styles.transcriptLine, effectiveHighlightedLine === i && styles.transcriptLineActive]}
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

function hasSegmentTiming(segment: TranscriptSegment | null | undefined): segment is TranscriptSegment & { start: number; end: number } {
  return (
    !!segment &&
    typeof segment.start === 'number' &&
    typeof segment.end === 'number' &&
    Number.isFinite(segment.start) &&
    Number.isFinite(segment.end) &&
    segment.end > segment.start
  );
}

function calculatePracticeScore(recordingMs: number, targetMs: number, rating: SelfRating): number {
  if (recordingMs <= 0 || targetMs <= 0) return 0;
  const ratio = Math.min(recordingMs, targetMs) / Math.max(recordingMs, targetMs);
  const timingScore = Math.round(ratio * 100);
  const ratingScore = SELF_RATINGS.find((item) => item.key === rating)?.score ?? 75;
  return Math.max(0, Math.min(100, Math.round(timingScore * 0.65 + ratingScore * 0.35)));
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
  practicePanel: {
    gap: spacing.md,
  },
  practiceModeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  practiceModeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
  },
  practiceModeButtonActive: {
    backgroundColor: colors.surface,
  },
  practiceModeText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  practiceModeTextActive: {
    color: colors.text,
  },
  sentenceCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sentenceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sentenceMetaText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  practicedBadge: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  sentencePracticeText: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 24,
  },
  sentenceTimeText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  sentenceControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sentenceToolButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sentenceToolButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sentenceToolText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  sentenceToolTextActive: {
    color: colors.surface,
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
  ratingLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  ratingChip: {
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  ratingChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  ratingChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  ratingChipTextActive: {
    color: colors.primary,
  },
  scorePreview: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success + '18',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  scorePreviewText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
  transcriptLineTimed: {
    cursor: Platform.OS === 'web' ? 'pointer' : undefined,
  } as any,
  transcriptLineActive: {
    backgroundColor: colors.primaryLight + '18',
    borderBottomColor: colors.primaryLight,
  },
  transcriptLineAuto: {
    backgroundColor: colors.primaryLight + '28',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  transcriptLineSelected: {
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  transcriptLineContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  transcriptText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 24,
  },
  segmentTime: {
    minWidth: 42,
    textAlign: 'right',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  alignmentMetaRow: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight + '18',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  alignmentMetaText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
