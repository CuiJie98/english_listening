export interface Sm2Result {
  easiness: number;
  interval_days: number;
  repetitions: number;
  next_review: number; // unix timestamp
}

export function calculateSm2(
  quality: number, // 0-5
  easiness: number,
  interval: number,
  repetitions: number
): Sm2Result {
  let newEasiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEasiness < 1.3) newEasiness = 1.3;

  let newInterval: number;
  let newRepetitions: number;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = repetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEasiness);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const nextReview = now + newInterval * 86400;

  return {
    easiness: Math.round(newEasiness * 100) / 100,
    interval_days: newInterval,
    repetitions: newRepetitions,
    next_review: nextReview,
  };
}
