'use client';
import React from 'react';

function highlightCode(code: string, language: string): string {
  if (language !== 'tsx' && language !== 'jsx' && language !== 'ts' && language !== 'js' && language !== 'css') {
    return escapeHtml(code);
  }

  let result = escapeHtml(code);

  if (language === 'css') {
    // CSS property names
    result = result.replace(/^(\s*)([\w-]+)(?=\s*:)/gm, '$1<span class="code-property">$2</span>');
    // CSS values after colons
    result = result.replace(/(:\s*)([^;{]+)/g, '$1<span class="code-value">$2</span>');
    // Selectors
    result = result.replace(/^(\s*)(\.[\w-]+)/gm, '$1<span class="code-selector">$2</span>');
    // Comments
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');
    return result;
  }

  // Comments
  result = result.replace(/(\/\/.*$)/gm, '<span class="code-comment">$1</span>');
  result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');

  // Strings
  result = result.replace(/(&quot;[^&]*?&quot;|&#x27;[^&]*?&#x27;|`[^`]*?`)/g, '<span class="code-string">$1</span>');

  // JSX attribute strings
  result = result.replace(/(=)(&quot;[^&]*?&quot;)/g, '$1<span class="code-string">$2</span>');

  // Keywords
  const keywords = ['import', 'export', 'from', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'switch', 'case', 'break', 'default', 'type', 'interface', 'extends', 'implements', 'class', 'new', 'typeof', 'as', 'in', 'of', 'for', 'while', 'do', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'void'];
  keywords.forEach((kw) => {
    result = result.replace(new RegExp(`\\b(${kw})\\b(?![^<]*>)`, 'g'), '<span class="code-keyword">$1</span>');
  });

  // JSX tags
  result = result.replace(/(&lt;\/?)([\w.]+)/g, '$1<span class="code-tag">$2</span>');

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="code-number">$1</span>');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function CodeBlock({ code, language = 'tsx' }: { code: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = highlightCode(code, language);

  return (
    <div className="relative group mt-4">
      <div className="absolute right-2 top-2 z-10">
        <button
          onClick={handleCopy}
          className="px-2 py-1 text-xs rounded-md bg-[var(--color-background)] text-[var(--color-foreground)] border border-[var(--color-border)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-muted)]"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="absolute left-3 top-2 text-[10px] uppercase tracking-wider text-[var(--color-background)] opacity-40">
        {language}
      </div>
      <pre className="bg-[var(--color-foreground)] text-[var(--color-background)] pt-8 pb-4 px-4 rounded-lg overflow-x-auto text-sm font-mono code-block">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}
