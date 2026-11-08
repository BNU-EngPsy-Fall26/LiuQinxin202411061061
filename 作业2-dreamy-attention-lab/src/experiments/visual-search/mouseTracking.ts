/**
 * Mouse trajectory recording for the visual-search task.
 *
 * These metrics are behavioural proxies for exploration. They are never
 * interpreted as gaze and are labelled as such in every data record.
 */

import type { MouseSampleInput, RegionNumber } from '@shared/types';
import { regionAtNormalizedPoint } from '@shared/visual-search';

export type MouseSample = MouseSampleInput;

export interface MouseTrackingResult {
  available: boolean;
  sample_count: number;
  valid_sample_count: number;
  valid_mouse_ratio: number | null;
  duration_ms: number;
  sufficient_for_metrics: boolean;
  path_length_px: number;
  first_movement_direction: string | null;
  first_movement_angle_deg: number | null;
  first_movement_latency_ms: number | null;
  first_movement_position: { x: number; y: number } | null;
  first_movement_region: RegionNumber | null;
  target_distance_normalized: number | null;
  target_region_relation: 'same_region' | 'different_region' | null;
  left_to_right_scan_ratio: number | null;
  right_to_left_scan_ratio: number | null;
  top_to_bottom_scan_ratio: number | null;
  bottom_to_top_scan_ratio: number | null;
  center_to_periphery_scan_ratio: number | null;
  periphery_to_center_scan_ratio: number | null;
  target_proximity_entered: boolean | null;
  target_first_proximity_ms: number | null;
  target_near_sample_ratio: number | null;
  samples: MouseSample[];
  note: string;
}

const MAX_SAMPLES = 2400;
const MIN_SAMPLE_INTERVAL_MS = 7;
const MOVEMENT_THRESHOLD_PX = 10;

export class MouseTrajectoryRecorder {
  private samples: MouseSample[] = [];
  private lastSampleAt = 0;
  private lastPosition: { x: number; y: number; t: number } | null = null;
  private rectangle: DOMRect;
  private disposed = false;
  private readonly handler: (event: PointerEvent) => void;

  constructor(
    private readonly element: HTMLElement,
    private readonly onset: number,
    private readonly targetPct: { x: number; y: number } | null,
  ) {
    this.rectangle = element.getBoundingClientRect();
    this.handler = (event: PointerEvent) => {
      if (this.disposed) return;
      const now = performance.now();
      if (now - this.lastSampleAt < MIN_SAMPLE_INTERVAL_MS) return;
      if (this.samples.length >= MAX_SAMPLES) return;
      const x = event.clientX - this.rectangle.left;
      const y = event.clientY - this.rectangle.top;
      if (
        x < 0 ||
        x > this.rectangle.width ||
        y < 0 ||
        y > this.rectangle.height
      ) {
        return;
      }
      this.lastSampleAt = now;
      const normalizedX = x / Math.max(this.rectangle.width, 1);
      const normalizedY = y / Math.max(this.rectangle.height, 1);
      const previous = this.lastPosition;
      const distance = previous
        ? Math.hypot(x - previous.x, y - previous.y)
        : 0;
      const elapsed = previous ? now - previous.t : 0;
      this.samples.push({
        sample_index: this.samples.length,
        t_ms: round(Math.max(0, now - this.onset)),
        timestamp_ms: round(now),
        x: round(x),
        y: round(y),
        normalized_x: round(normalizedX, 5),
        normalized_y: round(normalizedY, 5),
        movement_direction:
          distance >= MOVEMENT_THRESHOLD_PX ? classifyDirection(x - (previous?.x ?? x), y - (previous?.y ?? y)) : null,
        movement_distance: round(distance),
        velocity: elapsed > 0 ? round((distance / elapsed) * 1000, 2) : null,
        valid: true,
        phase: 'stimulus',
      });
      this.lastPosition = { x, y, t: now };
    };
    element.addEventListener('pointermove', this.handler, { passive: true });
  }

  markPostResponse(now = performance.now()): void {
    if (this.disposed || !this.lastPosition) return;
    const position = this.lastPosition;
    this.samples.push({
      sample_index: this.samples.length,
      t_ms: round(Math.max(0, now - this.onset)),
      timestamp_ms: round(now),
      x: round(position.x),
      y: round(position.y),
      normalized_x: round(position.x / Math.max(this.rectangle.width, 1), 5),
      normalized_y: round(position.y / Math.max(this.rectangle.height, 1), 5),
      movement_direction: null,
      movement_distance: 0,
      velocity: 0,
      valid: true,
      phase: 'post_response',
    });
  }

  stop(responseAt: number | null = null): MouseTrackingResult {
    if (responseAt !== null) this.markPostResponse(responseAt);
    this.disposed = true;
    this.element.removeEventListener('pointermove', this.handler);
    return computeMouseMetrics(this.samples, this.rectangle, this.targetPct);
  }
}

function computeMouseMetrics(
  samples: MouseSample[],
  rect: DOMRect,
  targetPct: { x: number; y: number } | null,
): MouseTrackingResult {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const points = samples.filter(
    (sample) => sample.valid && Number.isFinite(sample.x) && Number.isFinite(sample.y),
  );
  const sampleCount = points.length;
  const duration =
    points.length > 1
      ? points[points.length - 1].t_ms - points[0].t_ms
      : 0;
  let pathLength = 0;
  let horizontal = 0;
  let vertical = 0;
  let rightward = 0;
  let leftward = 0;
  let downward = 0;
  let upward = 0;
  let outward = 0;
  let inward = 0;

  const centerX = width / 2;
  const centerY = height / 2;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) continue;
    pathLength += distance;
    if (Math.abs(dx) >= Math.abs(dy)) {
      horizontal += Math.abs(dx);
      if (dx >= 0) rightward += Math.abs(dx);
      else leftward += Math.abs(dx);
    } else {
      vertical += Math.abs(dy);
      if (dy >= 0) downward += Math.abs(dy);
      else upward += Math.abs(dy);
    }
    const radialBefore = Math.hypot(previous.x - centerX, previous.y - centerY);
    const radialAfter = Math.hypot(current.x - centerX, current.y - centerY);
    const radialDelta = radialAfter - radialBefore;
    if (radialDelta >= 0) outward += Math.abs(radialDelta);
    else inward += Math.abs(radialDelta);
  }

  let firstMovement: { direction: string; angle: number; latency: number } | null = null;
  if (points.length >= 2) {
    const start = points[0];
    for (let index = 1; index < points.length; index += 1) {
      const candidate = points[index];
      const dx = candidate.x - start.x;
      const dy = candidate.y - start.y;
      if (Math.hypot(dx, dy) < MOVEMENT_THRESHOLD_PX) continue;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      firstMovement = {
        direction: classifyDirection(dx, dy),
        angle: round(angle),
        latency: candidate.t_ms,
      };
      break;
    }
  }

  let targetEntered: boolean | null = null;
  let targetFirstMs: number | null = null;
  let targetNearCount = 0;
  if (targetPct) {
    const tx = targetPct.x * width;
    const ty = targetPct.y * height;
    const threshold = Math.max(32, Math.min(width, height) * 0.07);
    for (const point of points) {
      if (Math.hypot(point.x - tx, point.y - ty) <= threshold) {
        targetNearCount += 1;
        if (targetFirstMs === null) targetFirstMs = point.t_ms;
      }
    }
    targetEntered = targetNearCount > 0;
  }

  const horizontalTotal = rightward + leftward;
  const verticalTotal = downward + upward;
  const radialTotal = outward + inward;
  const sufficient = sampleCount >= 8 && duration >= 120;

  return {
    available: sampleCount > 0,
    sample_count: samples.length,
    valid_sample_count: sampleCount,
    valid_mouse_ratio: samples.length > 0 ? round(sampleCount / samples.length, 4) : null,
    duration_ms: round(duration),
    sufficient_for_metrics: sufficient,
    path_length_px: round(pathLength),
    first_movement_direction: sufficient ? firstMovement?.direction ?? null : null,
    first_movement_angle_deg: sufficient ? firstMovement?.angle ?? null : null,
    first_movement_latency_ms: sufficient ? firstMovement?.latency ?? null : null,
    first_movement_position:
      sufficient && points.length > 0
        ? {
            x: round(points[0].normalized_x, 5),
            y: round(points[0].normalized_y, 5),
          }
        : null,
    first_movement_region:
      sufficient && points.length > 0
        ? regionAtNormalizedPoint(points[0].normalized_x, points[0].normalized_y)
        : null,
    target_distance_normalized:
      sufficient && targetPct && points.length > 0
        ? round(
            Math.hypot(
              targetPct.x - points[0].normalized_x,
              targetPct.y - points[0].normalized_y,
            ),
            4,
          )
        : null,
    target_region_relation:
      sufficient && targetPct
        ? regionAtNormalizedPoint(points[0].normalized_x, points[0].normalized_y) ===
          regionAtNormalizedPoint(targetPct.x, targetPct.y)
          ? 'same_region'
          : 'different_region'
        : null,
    left_to_right_scan_ratio:
      sufficient && horizontalTotal > 0 ? round(rightward / horizontalTotal, 4) : null,
    right_to_left_scan_ratio:
      sufficient && horizontalTotal > 0 ? round(leftward / horizontalTotal, 4) : null,
    top_to_bottom_scan_ratio:
      sufficient && verticalTotal > 0 ? round(downward / verticalTotal, 4) : null,
    bottom_to_top_scan_ratio:
      sufficient && verticalTotal > 0 ? round(upward / verticalTotal, 4) : null,
    center_to_periphery_scan_ratio:
      sufficient && radialTotal > 0 ? round(outward / radialTotal, 4) : null,
    periphery_to_center_scan_ratio:
      sufficient && radialTotal > 0 ? round(inward / radialTotal, 4) : null,
    target_proximity_entered: targetEntered,
    target_first_proximity_ms: targetFirstMs,
    target_near_sample_ratio:
      targetPct && points.length > 0 ? round(targetNearCount / points.length, 4) : null,
    samples,
    note:
      'Pointer trajectory is a behavioural proxy for search exploration; it is not eye-tracking data.',
  };
}

function classifyDirection(dx: number, dy: number): string {
  const normalized = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  if (normalized < 22.5 || normalized >= 337.5) return 'right';
  if (normalized < 67.5) return 'right-down';
  if (normalized < 112.5) return 'down';
  if (normalized < 157.5) return 'left-down';
  if (normalized < 202.5) return 'left';
  if (normalized < 247.5) return 'left-up';
  if (normalized < 292.5) return 'up';
  return 'right-up';
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
