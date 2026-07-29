export interface SourceBackedDailyWord {
  id: string;
  word: string;
  pronunciation?: string;
  meaning?: string;
  example?: string;
  imageUrl?: string;
}

/** The home card may show only an addressable dictionary record. Editorial
 * samples without an entry id cannot open a source trail and are rejected. */
export function sourceBackedDailyWord(value: unknown): SourceBackedDailyWord | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  if (typeof item.word !== 'string' || !item.word.trim()) return null;
  const optional = (key: string) => {
    const field = item[key];
    return typeof field === 'string' && field.trim() ? field.trim() : undefined;
  };
  return {
    id: item.id.trim(),
    word: item.word.trim(),
    pronunciation: optional('pronunciation'),
    meaning: optional('meaning'),
    example: optional('example'),
    imageUrl: optional('imageUrl'),
  };
}
