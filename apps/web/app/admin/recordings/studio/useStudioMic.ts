'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StudioRecorder, type MicState } from '@/lib/recording/recorder';

/**
 * Owns a single StudioRecorder (one microphone stream) and surfaces its live
 * state. Lifting mic ownership into a hook lets a guided flow open the mic on a
 * dedicated "mic check" step and then hand the *same* stream to the <Recorder>,
 * instead of each component grabbing its own stream. When no mic is injected,
 * <Recorder> calls this itself and behaves exactly as before.
 */
export interface StudioMic {
  recorder: StudioRecorder | null;
  micState: MicState;
  micDetail?: string;
  level: number;
  open: () => Promise<void>;
  /** mic stream is live (ready or recording) */
  isOpen: boolean;
}

export function useStudioMic(opts?: { autoOpen?: boolean }): StudioMic {
  const autoOpen = opts?.autoOpen ?? false;
  const recorderRef = useRef<StudioRecorder | null>(null);
  const [micState, setMicState] = useState<MicState>('idle');
  const [micDetail, setMicDetail] = useState<string | undefined>();
  const [level, setLevel] = useState(0);

  // Construct once on the client. Constructing is cheap and does NOT touch the
  // microphone — open() is what requests the stream.
  if (!recorderRef.current && typeof window !== 'undefined') {
    recorderRef.current = new StudioRecorder({
      onLevel: setLevel,
      onState: (s, detail) => {
        setMicState(s);
        setMicDetail(detail);
      },
    });
  }

  const open = useCallback(async () => {
    try {
      await recorderRef.current?.open();
    } catch {
      /* failure is surfaced via onState */
    }
  }, []);

  // If the user has ALREADY granted microphone permission, open the stream
  // automatically so they never have to tap "Turn on microphone" again. This
  // only runs when the caller opts in (the on-demand recorders), never grabs
  // the mic without an existing grant, and degrades to the manual button when
  // the Permissions API is unavailable.
  useEffect(() => {
    if (!autoOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
        if (!cancelled && perm?.state === 'granted') void open();
      } catch {
        /* Permissions API unsupported — leave the manual button */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoOpen, open]);

  useEffect(() => {
    return () => {
      recorderRef.current?.close();
    };
  }, []);

  const isOpen = micState === 'ready' || micState === 'recording';
  return { recorder: recorderRef.current, micState, micDetail, level, open, isOpen };
}
