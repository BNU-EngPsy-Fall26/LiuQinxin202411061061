import type { GazeSampleInput, MouseSampleInput, RegionNumber } from './types.js';
import {
  REGION_NUMBERS,
  SEARCH_AREA_PX,
  regionAtNormalizedPoint,
} from './visual-search.js';

export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface Fixation {
  region: RegionNumber | null;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  x: number;
  y: number;
  sample_count: number;
}

export interface GazeTrialMetrics {
  sample_count: number;
  valid_sample_count: number;
  valid_gaze_ratio: number | null;
  fixation_count: number;
  fixations: Fixation[];
  fixation_regions: Array<RegionNumber | null>;
  first_fixation_position: { x: number; y: number } | null;
  first_fixation_region: RegionNumber | null;
  first_fixation_quadrant: Quadrant | null;
  first_fixation_ms: number | null;
  target_first_fixation_ms: number | null;
  target_first_fixation_region: RegionNumber | null;
  target_distance_normalized: number | null;
  target_distance_px: number | null;
  regions_visited_before_target: number | null;
  target_region_visit_order: number | null;
  quadrant_transitions: number;
  quadrant_transition_ratio: number | null;
  left_to_right_transition_ratio: number | null;
  right_to_left_transition_ratio: number | null;
  top_to_bottom_transition_ratio: number | null;
  bottom_to_top_transition_ratio: number | null;
  center_to_periphery_transition_ratio: number | null;
  periphery_to_center_transition_ratio: number | null;
  quadrant_counts: Record<Quadrant, number>;
  region_counts: Record<RegionNumber, number>;
  quality_sufficient: boolean;
}

const CENTER_X = [0.34, 0.66] as const;
const CENTER_Y = [0.26, 0.74] as const;

/** Large, WebGazer-appropriate region AOI; never a letter-level AOI. */
export function quadrantOf(x: number, y: number): Quadrant {
  if (x >= CENTER_X[0] && x <= CENTER_X[1] && y >= CENTER_Y[0] && y <= CENTER_Y[1]) {
    return 'center';
  }
  if (y < 0.5) return x < 0.5 ? 'top-left' : 'top-right';
  return x < 0.5 ? 'bottom-left' : 'bottom-right';
}

/**
 * I-DT fixation extraction. Samples separated by a blink or by a large
 * dispersion break the current fixation. A fixation needs at least two valid
 * samples and 100 ms; direction conclusions require at least three fixations.
 */
function extractFixations(
  sequence: Array<{ x: number; y: number; t: number }>,
  dispersionThreshold = 0.08,
  minDurationMs = 100,
): Fixation[] {
  const fixations: Fixation[] = [];
  let cluster: Array<{ x: number; y: number; t: number }> = [];
  const finalize = () => {
    if (cluster.length < 2) {
      cluster = [];
      return;
    }
    const start = cluster[0].t;
    const end = cluster[cluster.length - 1].t;
    if (end - start < minDurationMs) {
      cluster = [];
      return;
    }
    const x = cluster.reduce((sum, point) => sum + point.x, 0) / cluster.length;
    const y = cluster.reduce((sum, point) => sum + point.y, 0) / cluster.length;
    fixations.push({
      region: regionAtNormalizedPoint(x, y),
      start_ms: round(start, 1),
      end_ms: round(end, 1),
      duration_ms: round(end - start, 1),
      x: round(x, 5),
      y: round(y, 5),
      sample_count: cluster.length,
    });
    cluster = [];
  };

  for (const point of sequence) {
    if (cluster.length === 0) {
      cluster.push(point);
      continue;
    }
    const centroidX =
      cluster.reduce((sum, item) => sum + item.x, 0) / cluster.length;
    const centroidY =
      cluster.reduce((sum, item) => sum + item.y, 0) / cluster.length;
    const dispersion = Math.max(
      Math.hypot(point.x - centroidX, point.y - centroidY),
      ...cluster.map((item) => Math.hypot(item.x - centroidX, item.y - centroidY)),
    );
    if (dispersion <= dispersionThreshold) {
      cluster.push(point);
    } else {
      finalize();
      cluster.push(point);
    }
  }
  finalize();
  return fixations;
}

export function computeGazeTrialMetrics({
  samples,
  targetAoi = null,
  targetPresent,
  targetNormalized = null,
  minValidRatio = 0.55,
}: {
  samples: GazeSampleInput[];
  /** Region number of the target, or null for target-absent trials. */
  targetAoi?: RegionNumber | null;
  targetPresent: boolean;
  targetNormalized?: { x: number; y: number } | null;
  minValidRatio?: number;
}): GazeTrialMetrics {
  const valid = samples.filter(
    (sample) =>
      sample.valid &&
      sample.normalized_x !== null &&
      sample.normalized_y !== null &&
      sample.normalized_x >= 0 &&
      sample.normalized_x <= 1 &&
      sample.normalized_y >= 0 &&
      sample.normalized_y <= 1,
  );
  const quadrantCounts: Record<Quadrant, number> = {
    'top-left': 0,
    'top-right': 0,
    'bottom-left': 0,
    'bottom-right': 0,
    center: 0,
  };
  const regionCounts = Object.fromEntries(
    REGION_NUMBERS.map((region) => [region, 0]),
  ) as Record<RegionNumber, number>;
  const sequence: Array<{ x: number; y: number; t: number; region: RegionNumber | null }> = [];
  for (const sample of valid) {
    const x = sample.normalized_x as number;
    const y = sample.normalized_y as number;
    const quadrant = quadrantOf(x, y);
    const region = regionAtNormalizedPoint(x, y);
    quadrantCounts[quadrant] += 1;
    if (region) regionCounts[region] += 1;
    sequence.push({ x, y, t: sample.t_ms, region });
  }

  const fixations = extractFixations(sequence);
  const fixationRegions = fixations.map((fixation) => fixation.region);
  const hasDirectionEvidence = fixations.length >= 3;
  let transitions = 0;
  let leftRight = 0;
  let rightLeft = 0;
  let topBottom = 0;
  let bottomTop = 0;
  let outward = 0;
  let inward = 0;
  for (let index = 1; index < fixations.length; index += 1) {
    const previous = fixations[index - 1];
    const current = fixations[index];
    if (current.region !== previous.region) transitions += 1;
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= 0.025) {
      if (dx > 0) leftRight += 1;
      else rightLeft += 1;
    } else if (Math.abs(dy) >= 0.025) {
      if (dy > 0) topBottom += 1;
      else bottomTop += 1;
    }
    const radialBefore = Math.hypot(previous.x - 0.5, previous.y - 0.5);
    const radialAfter = Math.hypot(current.x - 0.5, current.y - 0.5);
    if (Math.abs(radialAfter - radialBefore) >= 0.02) {
      if (radialAfter > radialBefore) outward += 1;
      else inward += 1;
    }
  }
  const horizontal = leftRight + rightLeft;
  const vertical = topBottom + bottomTop;
  const radial = outward + inward;
  const first = fixations[0] ?? null;
  const targetIndex =
    targetPresent && targetAoi !== null
      ? fixations.findIndex((fixation) => fixation.region === targetAoi)
      : -1;
  const targetFirst = targetIndex >= 0 ? fixations[targetIndex] : null;
  const validRatio =
    samples.length > 0 ? valid.length / samples.length : null;
  const targetDistanceFromFirst =
    targetNormalized && first
      ? Math.hypot(
          targetNormalized.x - first.x,
          targetNormalized.y - first.y,
        )
      : null;
  const regionsBeforeTarget =
    targetIndex > 0
      ? new Set(
          fixations
            .slice(0, targetIndex)
            .map((fixation) => fixation.region)
            .filter((region): region is RegionNumber => region !== null),
        ).size
      : null;

  return {
    sample_count: samples.length,
    valid_sample_count: valid.length,
    valid_gaze_ratio: validRatio,
    fixation_count: fixations.length,
    fixations,
    fixation_regions: fixationRegions,
    first_fixation_position: first
      ? { x: first.x, y: first.y }
      : null,
    first_fixation_region: first?.region ?? null,
    first_fixation_quadrant: first ? quadrantOf(first.x, first.y) : null,
    first_fixation_ms: first?.start_ms ?? null,
    target_first_fixation_ms: targetFirst?.start_ms ?? null,
    target_first_fixation_region: targetFirst?.region ?? null,
    target_distance_normalized:
      targetDistanceFromFirst === null ? null : round(targetDistanceFromFirst, 4),
    target_distance_px:
      targetDistanceFromFirst === null
        ? null
        : round(
            Math.hypot(
              (targetNormalized!.x - first!.x) * SEARCH_AREA_PX.width,
              (targetNormalized!.y - first!.y) * SEARCH_AREA_PX.height,
            ),
            1,
          ),
    regions_visited_before_target: regionsBeforeTarget,
    target_region_visit_order: targetIndex >= 0 ? targetIndex + 1 : null,
    quadrant_transitions: transitions,
    quadrant_transition_ratio:
      hasDirectionEvidence && fixations.length > 1
        ? round(transitions / (fixations.length - 1), 4)
        : null,
    left_to_right_transition_ratio:
      hasDirectionEvidence && horizontal > 0 ? round(leftRight / horizontal, 4) : null,
    right_to_left_transition_ratio:
      hasDirectionEvidence && horizontal > 0 ? round(rightLeft / horizontal, 4) : null,
    top_to_bottom_transition_ratio:
      hasDirectionEvidence && vertical > 0 ? round(topBottom / vertical, 4) : null,
    bottom_to_top_transition_ratio:
      hasDirectionEvidence && vertical > 0 ? round(bottomTop / vertical, 4) : null,
    center_to_periphery_transition_ratio:
      hasDirectionEvidence && radial > 0 ? round(outward / radial, 4) : null,
    periphery_to_center_transition_ratio:
      hasDirectionEvidence && radial > 0 ? round(inward / radial, 4) : null,
    quadrant_counts: quadrantCounts,
    region_counts: regionCounts,
    quality_sufficient:
      validRatio !== null &&
      validRatio >= minValidRatio &&
      fixations.length >= 3,
  };
}

export interface MouseTrialMetrics {
  sample_count: number;
  valid_sample_count: number;
  valid_mouse_ratio: number | null;
  first_movement_direction: string | null;
  first_movement_quadrant: Quadrant | null;
  first_movement_position: { x: number; y: number } | null;
  first_movement_region: RegionNumber | null;
  first_movement_latency_ms: number | null;
  path_length_px: number;
  target_distance_normalized: number | null;
  target_region_relation: 'same_region' | 'different_region' | null;
  quadrant_transitions: number;
  left_to_right_transition_ratio: number | null;
  right_to_left_transition_ratio: number | null;
  top_to_bottom_transition_ratio: number | null;
  bottom_to_top_transition_ratio: number | null;
  center_to_periphery_transition_ratio: number | null;
  periphery_to_center_transition_ratio: number | null;
  sufficient_for_metrics: boolean;
}

export function computeMouseTrialMetrics(
  samples: MouseSampleInput[],
  target?: {
    region?: RegionNumber | null;
    normalized?: { x: number; y: number } | null;
  },
): MouseTrialMetrics {
  const valid = samples.filter(
    (sample) =>
      sample.valid &&
      Number.isFinite(sample.normalized_x) &&
      Number.isFinite(sample.normalized_y),
  );
  let pathLength = 0;
  let leftRight = 0;
  let rightLeft = 0;
  let topBottom = 0;
  let bottomTop = 0;
  let outward = 0;
  let inward = 0;
  let transitions = 0;
  let previous: MouseSampleInput | null = null;
  let previousQuadrant: Quadrant | null = null;
  for (const sample of valid) {
    if (previous) {
      const dx = sample.normalized_x - previous.normalized_x;
      const dy = sample.normalized_y - previous.normalized_y;
      const distance = Math.hypot(dx, dy);
      pathLength += distance;
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= 0.01) {
        if (dx > 0) leftRight += 1;
        else rightLeft += 1;
      } else if (Math.abs(dy) >= 0.01) {
        if (dy > 0) topBottom += 1;
        else bottomTop += 1;
      }
      const radialBefore = Math.hypot(
        previous.normalized_x - 0.5,
        previous.normalized_y - 0.5,
      );
      const radialAfter = Math.hypot(
        sample.normalized_x - 0.5,
        sample.normalized_y - 0.5,
      );
      if (Math.abs(radialAfter - radialBefore) >= 0.01) {
        if (radialAfter > radialBefore) outward += 1;
        else inward += 1;
      }
    }
    const quadrant = quadrantOf(sample.normalized_x, sample.normalized_y);
    if (previousQuadrant && previousQuadrant !== quadrant) transitions += 1;
    previousQuadrant = quadrant;
    previous = sample;
  }
  const firstMovement = valid.find(
    (sample) =>
      sample.movement_direction !== null && sample.movement_distance > 0,
  );
  const firstRegion = firstMovement
    ? regionAtNormalizedPoint(
        firstMovement.normalized_x,
        firstMovement.normalized_y,
      )
    : null;
  const targetDistance =
    target?.normalized && firstMovement
      ? Math.hypot(
          target.normalized.x - firstMovement.normalized_x,
          target.normalized.y - firstMovement.normalized_y,
        )
      : null;
  const horizontal = leftRight + rightLeft;
  const vertical = topBottom + bottomTop;
  const radial = outward + inward;
  return {
    sample_count: samples.length,
    valid_sample_count: valid.length,
    valid_mouse_ratio: samples.length > 0 ? valid.length / samples.length : null,
    first_movement_direction: firstMovement?.movement_direction ?? null,
    first_movement_quadrant: firstMovement
      ? quadrantOf(firstMovement.normalized_x, firstMovement.normalized_y)
      : null,
    first_movement_position: firstMovement
      ? {
          x: firstMovement.normalized_x,
          y: firstMovement.normalized_y,
        }
      : null,
    first_movement_region: firstRegion,
    first_movement_latency_ms: firstMovement ? round(firstMovement.t_ms, 1) : null,
    path_length_px: round(pathLength, 4),
    target_distance_normalized: targetDistance === null ? null : round(targetDistance, 4),
    target_region_relation:
      target?.region && firstRegion
        ? target.region === firstRegion
          ? 'same_region'
          : 'different_region'
        : null,
    quadrant_transitions: transitions,
    left_to_right_transition_ratio: horizontal > 0 ? round(leftRight / horizontal, 4) : null,
    right_to_left_transition_ratio: horizontal > 0 ? round(rightLeft / horizontal, 4) : null,
    top_to_bottom_transition_ratio: vertical > 0 ? round(topBottom / vertical, 4) : null,
    bottom_to_top_transition_ratio: vertical > 0 ? round(bottomTop / vertical, 4) : null,
    center_to_periphery_transition_ratio: radial > 0 ? round(outward / radial, 4) : null,
    periphery_to_center_transition_ratio: radial > 0 ? round(inward / radial, 4) : null,
    sufficient_for_metrics: valid.length >= 8,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
