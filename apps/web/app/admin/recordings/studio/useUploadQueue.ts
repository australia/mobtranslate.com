'use client';

import { useEffect, useState } from 'react';
import { uploadQueue } from '@/lib/recording/uploadQueue';
import type { QueueItemView } from '@/lib/recording/types';

/** Subscribe to the background upload queue and keep a live snapshot. */
export function useUploadQueue() {
  const [items, setItems] = useState<QueueItemView[]>([]);

  useEffect(() => {
    uploadQueue.init();
    const unsub = uploadQueue.subscribe(setItems);
    return () => {
      unsub();
    };
  }, []);

  const pending = items.filter((i) => i.status === 'queued' || i.status === 'uploading');
  const errored = items.filter((i) => i.status === 'error');
  const uploaded = items.filter((i) => i.status === 'uploaded');

  return { items, pending, errored, uploaded, queue: uploadQueue };
}
