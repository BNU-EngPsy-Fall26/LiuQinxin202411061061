import type {
  ExperimentConfig,
  ExperimentId,
  SessionSummary,
} from '@shared/types';
import type { ConfigResponse } from './api';

const PARTICIPANT_KEY = 'dcl.participant_id';
const CONSENT_KEY = 'dcl.consent_at';
const SESSION_LOGIN_KEY = 'dcl.session_participant';
const CONFIG_PREFIX = 'dcl.config.';
const SUMMARY_PREFIX = 'dcl.summary.';
const ACTIVE_PREFIX = 'dcl.active.';

export interface ActiveSessionState {
  session_id: string;
  started_at: string;
  seed: string;
  config_version: number;
}

function makeBrowserId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeBrowserSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0].toString(36)}${values[1].toString(36)}`;
}

/**
 * Returns the same session/seed across refreshes. A completed session or a
 * config-version change starts a new one, so stale progress can never be
 * attached to a different protocol.
 */
export function getOrCreateActiveSession(
  participantId: string,
  experimentId: ExperimentId,
  configVersion: number,
): ActiveSessionState {
  const key = `${ACTIVE_PREFIX}${experimentId}.${participantId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveSessionState;
      if (
        parsed.session_id &&
        parsed.seed &&
        parsed.config_version === configVersion
      ) {
        return parsed;
      }
    }
    const state: ActiveSessionState = {
      session_id: makeBrowserId(),
      started_at: new Date().toISOString(),
      seed: makeBrowserSeed(),
      config_version: configVersion,
    };
    localStorage.setItem(key, JSON.stringify(state));
    return state;
  } catch {
    return {
      session_id: makeBrowserId(),
      started_at: new Date().toISOString(),
      seed: makeBrowserSeed(),
      config_version: configVersion,
    };
  }
}

export function saveActiveSessionProgress(
  sessionId: string,
  participantId: string,
  experimentId: ExperimentId,
  progress: Record<string, unknown>,
): void {
  try {
    localStorage.setItem(
      `${ACTIVE_PREFIX}progress.${experimentId}.${participantId}.${sessionId}`,
      JSON.stringify({ ...progress, saved_at: new Date().toISOString() }),
    );
  } catch {
    // In-memory queue still protects completed uploads.
  }
}

export function readActiveSessionProgress(
  sessionId: string,
  participantId: string,
  experimentId: ExperimentId,
): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(
      `${ACTIVE_PREFIX}progress.${experimentId}.${participantId}.${sessionId}`,
    );
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function clearActiveSession(
  participantId: string,
  experimentId: ExperimentId,
  sessionId: string,
): void {
  try {
    localStorage.removeItem(`${ACTIVE_PREFIX}${experimentId}.${participantId}`);
    localStorage.removeItem(
      `${ACTIVE_PREFIX}progress.${experimentId}.${participantId}.${sessionId}`,
    );
  } catch {
    // Non-critical.
  }
}

export function getParticipantId(): string | null {
  try {
    return localStorage.getItem(PARTICIPANT_KEY);
  } catch {
    return null;
  }
}

export function saveParticipantId(participantId: string): void {
  try {
    localStorage.setItem(PARTICIPANT_KEY, participantId);
  } catch {
    // Session state still lives in memory for this tab.
  }
}

export function recordConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, new Date().toISOString());
  } catch {
    // Non-critical.
  }
}

export function hasRecordedConsent(): boolean {
  try {
    return Boolean(localStorage.getItem(CONSENT_KEY));
  } catch {
    return false;
  }
}

/**
 * A participant login is shared by both active experiments for the current
 * browser tab. Keeping the flag in sessionStorage means a fresh visit still
 * passes through the login screen, while moving between experiments does not
 * ask for the same identity twice.
 */
export function markParticipantSessionActive(participantId: string): void {
  try {
    sessionStorage.setItem(SESSION_LOGIN_KEY, participantId);
  } catch {
    // The current React flow still works without session storage.
  }
}

export function hasActiveParticipantSession(): boolean {
  try {
    const sessionParticipant = sessionStorage.getItem(SESSION_LOGIN_KEY);
    return Boolean(
      sessionParticipant &&
        sessionParticipant === getParticipantId() &&
        hasRecordedConsent(),
    );
  } catch {
    return false;
  }
}

export function cacheExperimentConfig(response: ConfigResponse): void {
  try {
    localStorage.setItem(
      `${CONFIG_PREFIX}${response.experiment_id}`,
      JSON.stringify(response),
    );
  } catch {
    // Non-critical.
  }
}

export function readCachedExperimentConfig(
  experimentId: ExperimentId,
): ConfigResponse | null {
  try {
    const raw = localStorage.getItem(`${CONFIG_PREFIX}${experimentId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ConfigResponse;
  } catch {
    return null;
  }
}

export function saveLocalSummary(
  sessionId: string,
  summary: SessionSummary,
  experimentId: ExperimentId,
): void {
  try {
    localStorage.setItem(
      `${SUMMARY_PREFIX}${sessionId}`,
      JSON.stringify({ summary, experimentId, saved_at: new Date().toISOString() }),
    );
  } catch {
    // Non-critical.
  }
}

export function readLocalSummary(
  sessionId: string,
): { summary: SessionSummary; experimentId: ExperimentId } | null {
  try {
    const raw = localStorage.getItem(`${SUMMARY_PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as {
      summary: SessionSummary;
      experimentId: ExperimentId;
    };
  } catch {
    return null;
  }
}

export function collectEnvironment(config: ExperimentConfig): Record<string, unknown> {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = '';
  }
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
    },
    reduced_motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    timezone,
    config_snapshot: config,
    browser_clock: new Date().toISOString(),
    timing_note:
      'RTs use performance.now(); browser presentation latency is not photodiode-verified.',
  };
}

export function clearExperimentSessionKeys(sessionId: string): void {
  try {
    localStorage.removeItem(`${SUMMARY_PREFIX}${sessionId}`);
  } catch {
    // Non-critical.
  }
}
