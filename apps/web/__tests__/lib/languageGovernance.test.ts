import { describe, expect, it } from 'vitest';
import { governanceForLanguage } from '@/lib/language-governance';

describe('governanceForLanguage', () => {
  it('records a complete Kuku Yalanji source trail without overstating publication terms', () => {
    const governance = governanceForLanguage('kuku_yalanji');

    expect(governance.sourceEvidence.status).toBe('documented');
    expect(governance.publicationBasis.status).toBe('partial');
    expect(governance.communityRelationship.status).toBe('open');
    expect(governance.summary).toContain('not presented as official');
  });

  it('keeps Mi’gmaq legacy-field provenance distinct from linked source records', () => {
    const governance = governanceForLanguage('migmaq');

    expect(governance.sourceEvidence.status).toBe('partial');
    expect(governance.sourceEvidence.detail).toContain('origin of every legacy lexical field is not yet documented');
    expect(governance.publicationBasis.detail).toContain('CC BY-NC 4.0');
  });

  it('makes the Anindilyakwa source and permission gaps explicit', () => {
    const governance = governanceForLanguage('anindilyakwa');

    expect(governance.sourceEvidence.status).toBe('open');
    expect(governance.publicationBasis.status).toBe('open');
    expect(governance.references.some((reference) => reference.kind === 'rights')).toBe(true);
  });

  it('defaults unknown collections to open evidence rather than a community claim', () => {
    const governance = governanceForLanguage('not-recorded');

    expect(governance.collectionLabel).toBe('Independent working collection');
    expect(governance.sourceEvidence.status).toBe('open');
    expect(governance.communityRelationship.label).toBe('Relationship not documented');
  });
});
