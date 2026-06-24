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

export function useStudioMic(): StudioMic {
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

  useEffect(() => {
    return () => {
      recorderRef.current?.close();
    };
  }, []);

  const isOpen = micState === 'ready' || micState === 'recording';
  return { recorder: recorderRef.current, micState, micDetail, level, open, isOpen };
}
