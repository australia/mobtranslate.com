'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function PageOutline() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    const collect = () => setHeadings(Array.from(document.querySelectorAll('#main-content h2[id]')).map((heading) => ({
      id: heading.id,
      label: heading.textContent?.replace(/\s*#$/, '') ?? '',
    })));
    collect();
    const content = document.getElementById('main-content');
    const observer = new MutationObserver(collect);
    if (content) observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  if (!headings.length) return null;
  return (
    <aside className="page-outline" aria-label="On this page">
      <p className="font-semibold mb-3">On this page</p>
      <nav><ul>{headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`}>{heading.label}</a></li>)}</ul></nav>
    </aside>
  );
}
