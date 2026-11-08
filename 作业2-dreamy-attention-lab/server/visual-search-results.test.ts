import { describe, expect, it } from 'vitest';
import { fitSeries, type SearchCell } from './visual-search-results.js';

function cell(
  setSize: number,
  meanRt: number | null,
  nObservations = meanRt === null ? 0 : 1,
  nTrials = Math.max(1, nObservations),
): SearchCell {
  return {
    set_size: setSize,
    target_present: true,
    n_trials: nTrials,
    n_observations: nObservations,
    n_correct: nObservations,
    accuracy: nObservations > 0 ? 1 : 0,
    mean_rt_ms: meanRt,
    sd_rt_ms: null,
    se_rt_ms: null,
    ci_low: null,
    ci_high: null,
    sufficient_for_fit: nObservations >= 1,
  };
}

describe('exploratory visual-search slope fit', () => {
  it('fits a least-squares slope when at least two set sizes are valid', () => {
    const fit = fitSeries([
      cell(4, 500),
      cell(8, 633.3333333333),
      cell(16, 900),
      cell(24, null),
    ]);

    expect(fit.available).toBe(true);
    expect(fit.slope_ms_per_item).toBeCloseTo(33.3, 1);
    expect(fit.n_points).toBe(3);
    expect(fit.reason).toBeNull();
  });

  it('fits with only two valid set sizes', () => {
    const fit = fitSeries([
      cell(4, 500),
      cell(8, null),
      cell(16, 900),
      cell(24, null),
    ]);

    expect(fit.available).toBe(true);
    expect(fit.slope_ms_per_item).toBeCloseTo(33.3, 1);
    expect(fit.n_points).toBe(2);
  });

  it('keeps a negative slope instead of trimming it', () => {
    const fit = fitSeries([cell(4, 900), cell(24, 500)]);

    expect(fit.available).toBe(true);
    expect(fit.slope_ms_per_item).toBeCloseTo(-20, 1);
  });

  it('returns NA when fewer than two set sizes have valid correct RTs', () => {
    const fit = fitSeries([
      cell(4, 500),
      cell(8, null),
      cell(16, null),
      cell(24, null),
    ]);

    expect(fit.available).toBe(false);
    expect(fit.slope_ms_per_item).toBeNull();
    expect(fit.reason).toContain('至少需要 2 个不同 set size');
  });

  it('returns NA when there are no formal trials', () => {
    const fit = fitSeries([cell(4, null, 0, 0), cell(8, null, 0, 0)]);

    expect(fit.available).toBe(false);
    expect(fit.reason).toBe('没有正式试次，无法估计斜率。');
  });
});
