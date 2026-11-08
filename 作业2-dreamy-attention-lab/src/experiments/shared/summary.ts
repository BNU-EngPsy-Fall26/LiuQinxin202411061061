import type { SessionSummary } from '@shared/types';
import { mean, median, round } from '@/utils/timing';

export interface ScoredTrial {
  correct: boolean | null;
  responseTime: number | null;
  timeout: boolean;
  conditionId?: string;
}

export function buildSummary({
  formalTrials,
  totalFormal,
  practiceCompleted,
  details,
}: {
  formalTrials: ScoredTrial[];
  totalFormal: number;
  practiceCompleted: boolean;
  details?: Record<string, unknown>;
}): SessionSummary {
  const completed = formalTrials.length;
  const correctCount = formalTrials.filter((trial) => trial.correct === true).length;
  const accuracy = completed > 0 ? correctCount / completed : null;
  const correctRt = formalTrials
    .filter((trial) => trial.correct === true && !trial.timeout && trial.responseTime !== null)
    .map((trial) => trial.responseTime as number);
  return {
    completed_trials: completed,
    total_trials: totalFormal,
    accuracy: accuracy === null ? null : round(accuracy, 4),
    mean_response_time_ms: round(mean(correctRt), 1),
    median_response_time_ms: round(median(correctRt), 1),
    practice_completed: practiceCompleted,
    details,
    generated_at: new Date().toISOString(),
  };
}

export interface ConditionStats {
  n: number;
  accuracy: number | null;
  mean_rt_ms: number | null;
  median_rt_ms: number | null;
}

export function conditionStats(trials: ScoredTrial[]): ConditionStats {
  const valid = trials.filter((trial) => trial.correct !== null);
  const accuracy =
    valid.length > 0
      ? valid.filter((trial) => trial.correct === true).length / valid.length
      : null;
  const rts = trials
    .filter(
      (trial) => trial.correct === true && !trial.timeout && trial.responseTime !== null,
    )
    .map((trial) => trial.responseTime as number);
  return {
    n: trials.length,
    accuracy: accuracy === null ? null : round(accuracy, 4),
    mean_rt_ms: round(mean(rts), 1),
    median_rt_ms: round(median(rts), 1),
  };
}

export function groupBy<T>(
  items: T[],
  keyOf: (item: T) => string,
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}
