/**
 * WebGazer integration for the visual-search task.
 *
 * Design constraints:
 * - camera access is requested only after explicit opt-in;
 * - raw video is never uploaded or stored;
 * - failure never blocks the behavioural experiment;
 * - gaze estimates are exploratory and never merged with mouse coordinates.
 */

import type {
  CalibrationStatus,
  EyeTrackingStatus,
  GazeSampleInput,
} from '@shared/types';

type WebGazerPrediction = { x: number; y: number };

interface WebGazerLike {
  params: Record<string, unknown>;
  setGazeListener: (
    listener: ((data: WebGazerPrediction | null, elapsed: number) => void) | null,
  ) => WebGazerLike;
  clearGazeListener: () => WebGazerLike;
  setRegression: (name: string) => WebGazerLike;
  setTracker: (name: string) => WebGazerLike;
  applyKalmanFilter: (value: boolean) => WebGazerLike;
  showVideoPreview: (value: boolean) => WebGazerLike;
  // WebGazer's public toggle for the gaze dot is showPredictionPoints.
  // showGazeDot only exists as an internal params flag in WebGazer 3.5.3.
  showPredictionPoints: (value: boolean) => WebGazerLike;
  showFaceOverlay: (value: boolean) => WebGazerLike;
  showFaceFeedbackBox: (value: boolean) => WebGazerLike;
  saveDataAcrossSessions: (value: boolean) => WebGazerLike;
  begin: () => Promise<WebGazerLike>;
  end: () => WebGazerLike;
  pause: () => WebGazerLike;
  stopVideo: () => WebGazerLike;
  removeMouseEventListeners: () => WebGazerLike;
  recordScreenPosition: (x: number, y: number, eventType?: string) => WebGazerLike;
  getTracker: () =>
    | {
        getPositions?: () => unknown;
      }
    | undefined;
}

declare global {
  interface Window {
    webgazer?: WebGazerLike;
    __DCL_EYE_MOCK__?: boolean;
  }
}

export interface EyeValidationPoint {
  x: number;
  y: number;
  valid_samples: number;
  error_px: number | null;
}

export interface EyeValidationResult {
  points: EyeValidationPoint[];
  valid_points: number;
  median_error_px: number | null;
  passed: boolean;
  reason: string;
}

export interface EyeCaptureResult {
  samples: GazeSampleInput[];
  valid_gaze_ratio: number | null;
  eye_tracking_status: EyeTrackingStatus;
  calibration_status: CalibrationStatus;
  calibration_quality: number | null;
}

const SCRIPT_PATH = '/vendor/webgazer/webgazer.js';
let scriptPromise: Promise<WebGazerLike> | null = null;

function loadWebGazerScript(): Promise<WebGazerLike> {
  if (window.webgazer) return Promise.resolve(window.webgazer);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_PATH}"]`,
    );
    const script = existing ?? document.createElement('script');
    script.src = SCRIPT_PATH;
    script.async = true;
    script.onload = () => {
      if (window.webgazer) resolve(window.webgazer);
      else reject(new Error('WebGazer 脚本已加载，但未找到全局接口。'));
    };
    script.onerror = () => reject(new Error('无法加载本地 WebGazer 脚本。'));
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export class GazeTracker {
  status: EyeTrackingStatus = 'not_requested';
  calibrationStatus: CalibrationStatus = 'not_started';
  calibrationQuality: number | null = null;
  private webgazer: WebGazerLike | null = null;
  private trial: {
    onset: number;
    rect: DOMRect;
    samples: GazeSampleInput[];
    lastSampleAt: number;
  } | null = null;
  private latest: { x: number; y: number; t: number } | null = null;
  private faceLost = true;
  private validationBuffer: Array<{ x: number; y: number }> = [];
  private collectingValidation = false;
  private disposed = false;
  private mockTimer: number | null = null;
  private mockTarget = { x: 0, y: 0 };
  private mockTick = 0;
  readonly mock: boolean;

  constructor(
    private readonly intervalMs: number,
    private readonly validationMaxErrorPx: number,
    private readonly minValidRatio: number,
  ) {
    this.mock = Boolean(import.meta.env.DEV && window.__DCL_EYE_MOCK__);
  }

  async enable(): Promise<{ ok: boolean; reason: string }> {
    if (this.mock) {
      this.mockTarget = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      this.startMockLoop();
      return { ok: true, reason: '测试用注视模拟器已启用。' };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'unavailable';
      return { ok: false, reason: '当前浏览器不支持摄像头访问。' };
    }
    try {
      const webgazer = await loadWebGazerScript();
      if (this.disposed) return { ok: false, reason: '页面已离开。' };
      this.webgazer = webgazer;
      webgazer.params.faceMeshSolutionPath = '/vendor/webgazer/mediapipe/face_mesh';
      webgazer.saveDataAcrossSessions(false);
      webgazer.applyKalmanFilter(true);
      webgazer.setTracker('TFFacemesh');
      webgazer.setRegression('ridge');
      webgazer.showVideoPreview(false);
      webgazer.showFaceOverlay(false);
      webgazer.showFaceFeedbackBox(false);
      webgazer.showPredictionPoints(false);
      webgazer.setGazeListener((data) => this.handlePrediction(data));
      webgazer.removeMouseEventListeners();
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error('摄像头初始化超时。请检查权限设置。')),
          25000,
        );
      });
      await Promise.race([webgazer.begin(), timeout]);
      if (this.disposed) return { ok: false, reason: '页面已离开。' };
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      return { ok: true, reason: '摄像头与本地注视估计已启动。' };
    } catch (error) {
      this.status = 'unavailable';
      this.calibrationStatus = 'not_started';
      this.dispose();
      return {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : '摄像头或本地注视估计无法启动。',
      };
    }
  }

  markDeclined(): void {
    this.status = 'declined';
    this.calibrationStatus = 'declined';
    this.calibrationQuality = null;
  }

  markUnavailable(reason = ''): void {
    this.status = 'unavailable';
    this.calibrationStatus = 'not_started';
    this.calibrationQuality = null;
    if (reason) console.info('eye tracking unavailable:', reason);
  }

  beginCalibration(): void {
    this.calibrationStatus = 'not_started';
  }

  recordCalibrationPoint(clientX: number, clientY: number): void {
    if (this.mock) {
      this.mockTarget = { x: clientX, y: clientY };
      return;
    }
    try {
      this.webgazer?.recordScreenPosition(clientX, clientY, 'click');
    } catch {
      // A failed calibration click only reduces calibration quality.
    }
  }

  async validatePoint(
    clientX: number,
    clientY: number,
    durationMs = 900,
  ): Promise<EyeValidationPoint> {
    this.validationBuffer = [];
    this.collectingValidation = true;
    if (this.mock) {
      this.mockTarget = { x: clientX, y: clientY };
    }
    await new Promise((resolve) => window.setTimeout(resolve, durationMs));
    this.collectingValidation = false;
    const buffer = this.validationBuffer;
    this.validationBuffer = [];
    const error =
      buffer.length > 0
        ? Math.hypot(
            (median(buffer.map((sample) => sample.x)) ?? clientX) - clientX,
            (median(buffer.map((sample) => sample.y)) ?? clientY) - clientY,
          )
        : null;
    return {
      x: clientX,
      y: clientY,
      valid_samples: buffer.length,
      error_px: error === null ? null : Math.round(error * 10) / 10,
    };
  }

  finalizeValidation(points: EyeValidationPoint[], pointCount: number): EyeValidationResult {
    const usable = points.filter(
      (point) => point.error_px !== null && point.valid_samples >= 3,
    );
    const medianError = median(
      usable.map((point) => point.error_px as number),
    );
    const passed =
      usable.length >= Math.max(3, Math.ceil(pointCount * 0.6)) &&
      medianError !== null &&
      medianError <= this.validationMaxErrorPx;
    this.calibrationQuality =
      medianError === null ? null : Math.round(medianError * 10) / 10;
    if (passed) {
      this.status = 'calibrated';
      this.calibrationStatus = 'passed';
    } else {
      this.status = 'calibration_failed';
      this.calibrationStatus = 'failed';
    }
    return {
      points,
      valid_points: usable.length,
      median_error_px: this.calibrationQuality,
      passed,
      reason: passed
        ? `校准质量检查通过：${usable.length} 个验证点，中位误差约 ${Math.round(
            medianError ?? 0,
          )} px。`
        : medianError === null
          ? '未能获得足够的有效注视预测，校准未通过。'
          : `校准误差偏高（中位约 ${Math.round(
              medianError,
            )} px），结果仅作探索性参考。`,
    };
  }

  markCalibrationFailed(): void {
    this.status = 'calibration_failed';
    this.calibrationStatus = 'failed';
  }

  startTrial(onset: number, rect: DOMRect): void {
    this.trial = {
      onset,
      rect,
      samples: [],
      lastSampleAt: 0,
    };
    if (this.mock) {
      // Keep the development-only simulator inside the stimulus region after
      // validation, so its samples test the same normalisation path.
      this.mockTarget = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }

  stopTrial(responseAt: number | null): EyeCaptureResult {
    if (!this.trial) {
      return {
        samples: [],
        valid_gaze_ratio: null,
        eye_tracking_status: this.status,
        calibration_status: this.calibrationStatus,
        calibration_quality: this.calibrationQuality,
      };
    }
    if (responseAt !== null && this.latest) {
      this.pushTrialSample(this.latest.x, this.latest.y, responseAt, this.faceLost);
    }
    const capture = this.trial;
    this.trial = null;
    const samples = capture.samples;
    const valid = samples.filter((sample) => sample.valid).length;
    const ratio = samples.length > 0 ? valid / samples.length : null;
    let finalStatus = this.status;
    if (
      this.calibrationStatus === 'passed' &&
      ratio !== null &&
      (ratio < this.minValidRatio || valid < 5)
    ) {
      finalStatus = 'poor_quality';
    }
    return {
      samples,
      valid_gaze_ratio: ratio === null ? null : Math.round(ratio * 10000) / 10000,
      eye_tracking_status: finalStatus,
      calibration_status: this.calibrationStatus,
      calibration_quality: this.calibrationQuality,
    };
  }

  private handlePrediction(data: WebGazerPrediction | null): void {
    if (this.disposed) return;
    const now = performance.now();
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) {
      this.latest = null;
      this.faceLost = true;
      return;
    }
    this.latest = { x: data.x, y: data.y, t: now };
    this.faceLost = this.detectFaceLost();
    if (this.collectingValidation) {
      this.validationBuffer.push({ x: data.x, y: data.y });
    }
    if (this.trial) {
      this.pushTrialSample(data.x, data.y, now, this.faceLost);
    }
  }

  private pushTrialSample(
    screenX: number,
    screenY: number,
    timestamp: number,
    faceLost: boolean,
  ): void {
    const trial = this.trial;
    if (!trial) return;
    if (timestamp - trial.lastSampleAt < this.intervalMs) return;
    if (trial.samples.length >= 1200) return;
    trial.lastSampleAt = timestamp;
    const { rect } = trial;
    const normalizedX = (screenX - rect.left) / Math.max(rect.width, 1);
    const normalizedY = (screenY - rect.top) / Math.max(rect.height, 1);
    const withinStage =
      normalizedX >= 0 &&
      normalizedX <= 1 &&
      normalizedY >= 0 &&
      normalizedY <= 1;
    const valid = withinStage && !faceLost;
    trial.samples.push({
      sample_index: trial.samples.length,
      t_ms: Math.round(Math.max(0, timestamp - trial.onset) * 10) / 10,
      timestamp_ms: Math.round(timestamp * 10) / 10,
      screen_x: Math.round(screenX * 10) / 10,
      screen_y: Math.round(screenY * 10) / 10,
      normalized_x: Math.round(normalizedX * 10000) / 10000,
      normalized_y: Math.round(normalizedY * 10000) / 10000,
      valid,
      face_lost: faceLost,
    });
  }

  private detectFaceLost(): boolean {
    try {
      const positions = this.webgazer?.getTracker?.()?.getPositions?.();
      return !Array.isArray(positions) || positions.length === 0;
    } catch {
      return true;
    }
  }

  private startMockLoop(): void {
    if (this.mockTimer !== null) return;
    this.mockTimer = window.setInterval(() => {
      if (this.disposed) return;
      this.mockTick += 1;
      const target = this.mockTarget;
      const jitterX = Math.sin(this.mockTick / 3) * 9;
      const jitterY = Math.cos(this.mockTick / 4) * 7;
      this.latest = {
        x: target.x + jitterX,
        y: target.y + jitterY,
        t: performance.now(),
      };
      this.faceLost = false;
      if (this.collectingValidation) {
        this.validationBuffer.push({
          x: this.latest.x,
          y: this.latest.y,
        });
      }
      if (this.trial) {
        this.pushTrialSample(
          this.latest.x,
          this.latest.y,
          this.latest.t,
          false,
        );
      }
    }, Math.max(20, this.intervalMs));
  }

  dispose(): void {
    this.disposed = true;
    this.trial = null;
    this.collectingValidation = false;
    if (this.mockTimer !== null) {
      window.clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
    if (this.webgazer) {
      try {
        this.webgazer.clearGazeListener();
        this.webgazer.pause();
        this.webgazer.stopVideo();
        this.webgazer.end();
      } catch {
        // Camera resources may already be released by the browser.
      }
      this.webgazer = null;
    }
  }
}
