import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useCallback } from 'react';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { getVocabCards, getDueVocabCards, deleteVocabCard } from '../../src/database/queries';
import type { VocabWithReview } from '../../src/types/vocab';
import { calculateNextReview } from '../../src/utils/spacedRepetition';

export default function VocabScreen() {
  const db = useSQLiteContext();
  const [cards, setCards] = useState<VocabWithReview[]>([]);
  const [dueCards, setDueCards] = useState<VocabWithReview[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const loadCards = useCallback(async () => {
    const allCards = await getVocabCards(db);
    const due = await getDueVocabCards(db);
    setCards(allCards);
    setDueCards(due);
  }, [db]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleStartReview = () => {
    if (dueCards.length === 0) return;
    setReviewMode(true);
    setCurrentIndex(0);
    setFlipped(false);
  };

  const handleRate = async (quality: number) => {
    const card = dueCards[currentIndex];
    if (!card?.review) return;

    const result = calculateNextReview({
      easiness: card.review.easiness,
      interval: card.review.interval_days,
      repetitions: card.review.repetitions,
      quality,
    });

    await db.runAsync(
      `INSERT OR REPLACE INTO review_state
       (card_id, easiness, interval_days, repetitions, next_review, last_review)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [card.id, result.easiness, result.interval, result.repetitions, result.nextReview, Math.floor(Date.now() / 1000)]
    );

    if (currentIndex + 1 < dueCards.length) {
      setCurrentIndex(currentIndex + 1);
      setFlipped(false);
    } else {
      setReviewMode(false);
      await loadCards();
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteVocabCard(db, id);
          await loadCards();
        },
      },
    ]);
  };

  if (reviewMode && dueCards.length > 0) {
    const card = dueCards[currentIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.progress}>
          {currentIndex + 1} / {dueCards.length}
        </Text>

        <TouchableOpacity
          style={styles.flashcard}
          onPress={() => setFlipped(!flipped)}
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
                <Text style={styles.flashcardContext}>"{card.context}"</Text>
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
                style={[styles.rateButton, { backgroundColor: color }]}
                onPress={() => handleRate(q)}
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
          <Text style={styles.reviewBannerAction}>Start →</Text>
        </TouchableOpacity>
      )}

      {cards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No vocabulary yet</Text>
          <Text style={styles.emptyHint}>
            Long-press words in episode transcripts to save them
          </Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={styles.vocabCard}
              onLongPress={() => handleDelete(card.id)}
            >
              <Text style={styles.vocabWord}>{card.word_or_phrase}</Text>
              {card.definition && (
                <Text style={styles.vocabDef} numberOfLines={1}>
                  {card.definition}
                </Text>
              )}
              {card.context && (
                <Text style={styles.vocabContext} numberOfLines={1}>
                  "{card.context}"
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
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
  cardList: {
    gap: spacing.sm,
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
  // Review mode styles
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
    padding: spacing.sm,
    alignItems: 'center',
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
});
