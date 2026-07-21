import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContactEmailLink } from '@/app/components/ContactEmailLink';

describe('ContactEmailLink', () => {
  it('keeps a complete email address out of server-rendered HTML', () => {
    const html = renderToString(<ContactEmailLink className="contact" />);

    expect(html).toContain('ajax [at] mobtranslate.com');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('ajax@mobtranslate.com');
  });

  it('restores an accessible mail link after hydration', async () => {
    render(<ContactEmailLink />);

    const link = await waitFor(() =>
      screen.getByRole('link', { name: 'Email ajax@mobtranslate.com' }),
    );
    expect(link).toHaveAttribute('href', 'mailto:ajax@mobtranslate.com');
    expect(link).toHaveTextContent('ajax@mobtranslate.com');
  });
});
