-- MediaRecorder emits codecs-parameterized MIME (e.g. audio/webm;codecs=opus)
-- and the storage allowlist matches exactly. Routes normalize to base types,
-- but accept the parameterized variants too so uploads are never rejected.
update storage.buckets
set allowed_mime_types = array[
  'audio/wav','audio/x-wav','audio/wave',
  'audio/webm','audio/webm;codecs=opus',
  'audio/ogg','audio/ogg;codecs=opus','audio/opus',
  'audio/mpeg'
]
where id = 'recordings';
