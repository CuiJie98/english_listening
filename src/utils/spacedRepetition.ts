export interface ReviewInput {
  easiness: number;
  interval: number;
  repetitions: number;
  quality: number; // 0-5
}

export interface ReviewOutput {
  easiness: number;
  interval: number;
  repetitions: number;
  nextReview: number; // unix timestamp in seconds
}

export function calculateNextReview(input: ReviewInput): ReviewOutput {
  let { easiness, interval, repetitions, quality } = input;

  if (quality >= 3) {
    // Successful recall
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  } else {
    // Failed recall
    repetitions = 0;
    interval = 1;
  }

  // Update easiness factor (SM-2 formula)
  easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easiness < 1.3) easiness = 1.3;

  const nextReview = Math.floor(Date.now() / 1000) + interval * 86400;

  return { easiness, interval, repetitions, nextReview };
}
