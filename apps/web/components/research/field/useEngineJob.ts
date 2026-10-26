'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineJob } from '@/lib/research/field/types';

/** Poll an engine job until it finishes, then call `onDone`. */
export function useEngineJob(onDone: (_job: EngineJob & { result?: unknown }) => void) {
  const [status, setStatus] = useState<(EngineJob & { result?: unknown }) | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/admin/research/field/jobs/${jobId}`, { cache: 'no-store' });
        if (response.ok) {
          const body = (await response.json()) as EngineJob & { result?: unknown };
          if (cancelled) return;
          setStatus(body);
          if (body.state === 'done' || body.state === 'failed') {
            setJobId(null);
            if (body.state === 'done') done.current(body);
            return;
          }
        }
      } catch {
        // Keep polling through a dropped connection.
      }
      if (!cancelled) timer = setTimeout(poll, 2_000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const watch = useCallback((id: string) => {
    setStatus(null);
    setJobId(id);
  }, []);

  return { status, running: jobId !== null, watch };
}
