import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResearchDocumentBoundary from '@/components/research/ResearchDocumentBoundary';

const replace = vi.fn();

function navigationEntry(url: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ name: url } as PerformanceEntry]);
}

describe('ResearchDocumentBoundary', () => {
  beforeEach(() => {
    replace.mockClear();
    vi.stubGlobal('location', { ...window.location, href: 'https://mobtranslate.com/admin/research/quinkan', replace });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.dataLayer;
    delete window.gtag;
  });

  it('mounts research content in a document loaded inside the section', async () => {
    navigationEntry('https://mobtranslate.com/admin/research/quinkan/private');
    render(<ResearchDocumentBoundary><p>restricted evidence</p></ResearchDocumentBoundary>);
    expect(await screen.findByText('restricted evidence')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('reloads instead of mounting when the document began on a public page', () => {
    navigationEntry('https://mobtranslate.com/dictionaries');
    render(<ResearchDocumentBoundary><p>restricted evidence</p></ResearchDocumentBoundary>);
    expect(screen.queryByText('restricted evidence')).toBeNull();
    expect(replace).toHaveBeenCalledWith('https://mobtranslate.com/admin/research/quinkan');
  });

  it('reloads when analytics has run in this document', () => {
    navigationEntry('https://mobtranslate.com/admin/research');
    window.dataLayer = [];
    render(<ResearchDocumentBoundary><p>restricted evidence</p></ResearchDocumentBoundary>);
    expect(screen.queryByText('restricted evidence')).toBeNull();
    expect(replace).toHaveBeenCalled();
  });
});
