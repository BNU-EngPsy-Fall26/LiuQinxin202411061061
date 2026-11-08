import { useCallback, useEffect, useRef, useState } from 'react';

interface MonitorState {
  armed: boolean;
  trialStartedAt: number;
  visibilityEvents: number;
  blurEvents: number;
  hiddenStartedAt: number | null;
  totalHiddenMs: number;
  hiddenAtStart: boolean;
}

export interface AttentionSnapshot {
  visibility_events: number;
  window_blur_events: number;
  hidden_at_start: boolean;
  hidden_during_trial_ms: number;
  hidden_at_response: boolean;
  attention_compromised: boolean;
}

/**
 * Records tab visibility and window focus loss during active trials.
 * These events are stored as validity metadata, never silently discarded.
 */
export function useAttentionMonitor() {
  const stateRef = useRef<MonitorState>({
    armed: false,
    trialStartedAt: 0,
    visibilityEvents: 0,
    blurEvents: 0,
    hiddenStartedAt: null,
    totalHiddenMs: 0,
    hiddenAtStart: false,
  });
  const [tabWasHidden, setTabWasHidden] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      const state = stateRef.current;
      if (!state.armed) return;
      if (document.hidden) {
        state.visibilityEvents += 1;
        state.hiddenStartedAt = performance.now();
        setTabWasHidden(true);
      } else if (state.hiddenStartedAt !== null) {
        state.totalHiddenMs += performance.now() - state.hiddenStartedAt;
        state.hiddenStartedAt = null;
      }
    };
    const onBlur = () => {
      const state = stateRef.current;
      if (state.armed) state.blurEvents += 1;
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const armTrial = useCallback(() => {
    stateRef.current = {
      armed: true,
      trialStartedAt: performance.now(),
      visibilityEvents: document.hidden ? 1 : 0,
      blurEvents: 0,
      hiddenStartedAt: document.hidden ? performance.now() : null,
      totalHiddenMs: 0,
      hiddenAtStart: document.hidden,
    };
    setTabWasHidden(document.hidden);
  }, []);

  const snapshot = useCallback((): AttentionSnapshot => {
    const state = stateRef.current;
    const hiddenMs =
      state.totalHiddenMs +
      (state.hiddenStartedAt !== null ? performance.now() - state.hiddenStartedAt : 0);
    return {
      visibility_events: state.visibilityEvents,
      window_blur_events: state.blurEvents,
      hidden_at_start: state.hiddenAtStart,
      hidden_during_trial_ms: Math.round(hiddenMs),
      hidden_at_response: document.hidden,
      attention_compromised:
        state.visibilityEvents > 0 ||
        state.blurEvents > 0 ||
        state.hiddenAtStart ||
        document.hidden,
    };
  }, []);

  const disarmTrial = useCallback(() => {
    stateRef.current.armed = false;
    stateRef.current.hiddenStartedAt = null;
    setTabWasHidden(false);
  }, []);

  return { armTrial, snapshot, disarmTrial, tabWasHidden };
}
