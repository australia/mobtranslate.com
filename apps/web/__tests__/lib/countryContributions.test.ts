import { contributionFieldsSchema } from '@/lib/country/contributions';

const base = { language: 'kuku_yalanji', target: 'entry:catfish', name: 'Someone' };

describe('country contribution fields', () => {
  it('accepts a note with a body', () => {
    expect(contributionFieldsSchema.safeParse({ ...base, kind: 'note', body: 'We catch them at night.' }).success).toBe(true);
  });

  it('rejects a note with nothing written', () => {
    expect(contributionFieldsSchema.safeParse({ ...base, kind: 'note' }).success).toBe(false);
  });

  it('accepts a photo with only a short caption', () => {
    expect(contributionFieldsSchema.safeParse({ ...base, kind: 'photo', body: 'Below the homestead' }).success).toBe(true);
  });

  it('needs a title and body for a new page, and only new pages may target "new"', () => {
    expect(contributionFieldsSchema.safeParse({ language: 'kuku_yalanji', target: 'new', kind: 'page', name: 'A', title: 'Nonda plum', body: 'Fruit tree' }).success).toBe(true);
    expect(contributionFieldsSchema.safeParse({ language: 'kuku_yalanji', target: 'new', kind: 'page', name: 'A', body: 'Fruit tree' }).success).toBe(false);
    expect(contributionFieldsSchema.safeParse({ ...base, kind: 'page', title: 'X', body: 'Y' }).success).toBe(false);
    expect(contributionFieldsSchema.safeParse({ language: 'kuku_yalanji', target: 'new', kind: 'note', name: 'A', body: 'Y' }).success).toBe(false);
  });

  it('rejects malformed targets and a missing name', () => {
    expect(contributionFieldsSchema.safeParse({ ...base, target: 'entry:../x', kind: 'note', body: 'Y' }).success).toBe(false);
    expect(contributionFieldsSchema.safeParse({ ...base, name: '  ', kind: 'note', body: 'Y' }).success).toBe(false);
  });
});
