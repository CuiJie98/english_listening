import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import {
  getVocabCards,
  getDueVocabCards,
  deleteVocabCard,
  updateVocabCard,
  submitReview,
  type VocabWithReview,
} from '../../src/services/apiClient';

type CardView = 'all' | 'due';
type ReviewSummary = {
  total: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  nextReview: number | null;
};

export default function VocabScreen() {
  const [cards, setCards] = useState<VocabWithReview[]>([]);
  const [dueCards, setDueCards] = useState<VocabWithReview[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editCard, setEditCard] = useState<VocabWithReview | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editDefinition, setEditDefinition] = useState('');
  const [editContext, setEditContext] = useState('');
  const [query, setQuery] = useState('');
  const [cardView, setCardView] = useState<CardView>('all');
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewSummary>({
    total: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    nextReview: null,
  });

  const visibleCards = useMemo(() => {
    const source = cardView === 'due' ? dueCards : cards;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((card) => (
      card.word_or_phrase.toLowerCase().includes(needle) ||
      (card.definition || '').toLowerCase().includes(needle) ||
      (card.context || '').toLowerCase().includes(needle)
    ));
  }, [cardView, cards, dueCards, query]);

  const loadCards = useCallback(async () => {
    try {
      setError('');
      const [allCards, due] = await Promise.all([
        getVocabCards(),
        getDueVocabCards(),
      ]);
      setCards(allCards);
      setDueCards(due);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleStartReview = () => {
    if (dueCards.length === 0) return;
    setReviewSummary(null);
    setReviewStats({
      total: 0,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
      nextReview: null,
    });
    setReviewMode(true);
    setCurrentIndex(0);
    setFlipped(false);
  };

  const handleFlip = () => {
    setFlipped(!flipped);
  };

  const handleRate = async (quality: number) => {
    if (submitting) return;
    const card = dueCards[currentIndex];
    if (!card) return;

    setSubmitting(true);
    try {
      const result = await submitReview(card.id, quality);
      const nextStats = {
        ...reviewStats,
        total: reviewStats.total + 1,
        again: reviewStats.again + (quality === 1 ? 1 : 0),
        hard: reviewStats.hard + (quality === 3 ? 1 : 0),
        good: reviewStats.good + (quality === 4 ? 1 : 0),
        easy: reviewStats.easy + (quality === 5 ? 1 : 0),
        nextReview: result.next_review,
      };
      setReviewStats(nextStats);
      if (currentIndex + 1 < dueCards.length) {
        setCurrentIndex(currentIndex + 1);
        setFlipped(false);
      } else {
        setReviewMode(false);
        setReviewSummary(nextStats);
        await loadCards();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardAction = (card: VocabWithReview) => {
    Alert.alert(card.word_or_phrase, undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setEditCard(card);
          setEditWord(card.word_or_phrase);
          setEditDefinition(card.definition || '');
          setEditContext(card.context || '');
          setEditModalVisible(true);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete', 'Remove this card?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteVocabCard(card.id);
                  await loadCards();
                } catch (err: any) {
                  Alert.alert('Error', err?.message || 'Failed to delete card');
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editCard || !editWord.trim()) return;
    try {
      await updateVocabCard(editCard.id, {
        word_or_phrase: editWord.trim(),
        definition: editDefinition.trim() || undefined,
        context: editContext.trim() || undefined,
      });
      setEditModalVisible(false);
      await loadCards();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update card');
    }
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
        <TouchableOpacity style={styles.retryButton} onPress={loadCards}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (reviewMode && dueCards.length > 0) {
    const card = dueCards[currentIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.progress}>
          {currentIndex + 1} / {dueCards.length}
        </Text>

        <TouchableOpacity
          style={styles.flashcard}
          onPress={handleFlip}
          activeOpacity={0.8}
        >
          {!flipped ? (
            <Text style={styles.flashcardWord}>{card.word_or_phrase}</Text>
          ) : (
            <View>
              <Text style={styles.flashcardWord}>{card.word_or_phrase}</Text>
              {card.definition && (
                <Text style={styles.flashcardDef}>{card.definition}</Text>
              )}
              {card.context && (
                <Text style={styles.flashcardContext}>&ldquo;{card.context}&rdquo;</Text>
              )}
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.tapHint}>{flipped ? 'Rate your recall:' : 'Tap to flip'}</Text>

        {flipped && (
          <View style={styles.rateRow}>
            {[
              { q: 1, label: 'Again', color: colors.error },
              { q: 3, label: 'Hard', color: colors.warning },
              { q: 4, label: 'Good', color: colors.primary },
              { q: 5, label: 'Easy', color: colors.success },
            ].map(({ q, label, color }) => (
              <TouchableOpacity
                key={q}
                style={[styles.rateButton, { backgroundColor: color }, submitting && styles.rateButtonDisabled]}
                onPress={() => handleRate(q)}
                disabled={submitting}
              >
                <Text style={styles.rateButtonText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.exitButton}
          onPress={() => setReviewMode(false)}
        >
          <Text style={styles.exitButtonText}>Exit Review</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vocabulary</Text>
        <Text style={styles.cardCount}>{cards.length} cards</Text>
      </View>

      {dueCards.length > 0 && (
        <TouchableOpacity style={styles.reviewBanner} onPress={handleStartReview}>
          <Text style={styles.reviewBannerText}>
            {dueCards.length} cards due for review
          </Text>
          <Text style={styles.reviewBannerAction}>Start ›</Text>
        </TouchableOpacity>
      )}

      {reviewSummary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Review complete</Text>
          <Text style={styles.summaryText}>
            {reviewSummary.total} reviewed · Again {reviewSummary.again} · Hard {reviewSummary.hard} · Good {reviewSummary.good} · Easy {reviewSummary.easy}
          </Text>
          {reviewSummary.nextReview ? (
            <Text style={styles.summaryHint}>
              Next review from {new Date(reviewSummary.nextReview * 1000).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.controls}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search words, definitions, context"
          autoCapitalize="none"
        />
        <View style={styles.viewSwitch}>
          {[
            { key: 'all', label: 'All' },
            { key: 'due', label: `Due (${dueCards.length})` },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.viewOption, cardView === item.key && styles.viewOptionActive]}
              onPress={() => setCardView(item.key as CardView)}
            >
              <Text style={[styles.viewOptionText, cardView === item.key && styles.viewOptionTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {cards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No vocabulary yet</Text>
          <Text style={styles.emptyHint}>
            Long-press words in episode transcripts to save them
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleCards}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.vocabCard}
              onPress={() => handleCardAction(item)}
              onLongPress={() => handleCardAction(item)}
            >
              <Text style={styles.vocabWord}>{item.word_or_phrase}</Text>
              {item.definition && (
                <Text style={styles.vocabDef} numberOfLines={1}>
                  {item.definition}
                </Text>
              )}
              {item.context && (
                <Text style={styles.vocabContext} numberOfLines={1}>
                  &ldquo;{item.context}&rdquo;
                </Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.cardList}
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <Text style={styles.emptyHint}>No cards match this view</Text>
            </View>
          }
        />
      )}

      <Modal visible={editModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Card</Text>

            <Text style={styles.modalLabel}>Word / Phrase</Text>
            <TextInput
              style={styles.modalInput}
              value={editWord}
              onChangeText={setEditWord}
              placeholder="Word or phrase"
              autoCapitalize="none"
              autoFocus
            />

            <Text style={styles.modalLabel}>Definition</Text>
            <TextInput
              style={styles.modalInput}
              value={editDefinition}
              onChangeText={setEditDefinition}
              placeholder="Definition (optional)"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Context</Text>
            <TextInput
              style={styles.modalInput}
              value={editContext}
              onChangeText={setEditContext}
              placeholder="Context (optional)"
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, !editWord.trim() && styles.modalSaveDisabled]}
                onPress={handleSaveEdit}
                disabled={!editWord.trim()}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  cardCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  reviewBanner: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  reviewBannerText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  reviewBannerAction: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  summaryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  summaryHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  controls: {
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
  viewSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  viewOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  viewOptionActive: {
    backgroundColor: colors.surface,
  },
  viewOptionText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  viewOptionTextActive: {
    color: colors.text,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyInline: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
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
  cardList: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  vocabCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  vocabWord: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  vocabDef: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  vocabContext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  progress: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  flashcard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  flashcardWord: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  flashcardDef: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  flashcardContext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  tapHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  rateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  rateButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    minHeight: 44,
  },
  rateButtonDisabled: {
    opacity: 0.5,
  },
  rateButtonText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  exitButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  exitButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
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
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
