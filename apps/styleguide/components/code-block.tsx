'use client';

import { useEffect, useRef, useState } from 'react';

export function CodeBlock({ code, language = 'tsx' }: { code: string; language?: string }) {
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Copied to clipboard.');
      timer.current = setTimeout(() => setStatus(''), 2000);
    } catch {
      setStatus('Clipboard unavailable. Select the code and copy it manually.');
    }
  };

  return (
    <div className="code-example mt-4">
      <div className="code-toolbar">
        <span className="font-mono text-xs">{language}</span>
        <button onClick={handleCopy} aria-label={`Copy ${language} example`}>Copy code</button>
      </div>
      <pre role="group" tabIndex={0} aria-label={`${language} example`} className="overflow-x-auto p-4 text-sm font-mono"><code>{code}</code></pre>
      <p role="status" className="copy-status">{status}</p>
    </div>
  );
}
