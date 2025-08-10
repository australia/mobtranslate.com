import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export interface LexicalEntry {
  id: number;
  lexical_id: string;
  canonical_form: string;
  definition_en: string;
  translation_en: string;
}

export interface QuizQuestion {
  id: number;
  wajarri_word: string;
  correct_answer: string;
  options: string[];
  type: 'translation' | 'definition';
}

export async function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'wajarri_dictionary.db');
    
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }
  
  return db;
}

export async function getRandomWords(limit: number = 10): Promise<LexicalEntry[]> {
  const database = await getDb();
  
  const query = `
    SELECT id, lexical_id, canonical_form, definition_en, translation_en
    FROM lexical_entries
    WHERE translation_en != '' AND canonical_form != ''
    ORDER BY RANDOM()
    LIMIT ?
  `;
  
  return database.all(query, limit);
}

export async function generateQuizQuestion(): Promise<QuizQuestion> {
  const database = await getDb();
  
  // Get one correct answer
  const correctWord = await database.get<LexicalEntry>(`
    SELECT id, canonical_form, definition_en, translation_en
    FROM lexical_entries
    WHERE translation_en != '' AND canonical_form != ''
    ORDER BY RANDOM()
    LIMIT 1
  `);
  
  if (!correctWord) {
    throw new Error('No words available for quiz');
  }
  
  // Get 3 incorrect options
  const incorrectOptions = await database.all<LexicalEntry[]>(`
    SELECT translation_en
    FROM lexical_entries
    WHERE id != ? AND translation_en != '' AND translation_en != ?
    ORDER BY RANDOM()
    LIMIT 3
  `, correctWord.id, correctWord.translation_en);
  
  // Create shuffled options
  const options = [
    correctWord.translation_en,
    ...incorrectOptions.map(opt => opt.translation_en)
  ].sort(() => Math.random() - 0.5);
  
  return {
    id: correctWord.id,
    wajarri_word: correctWord.canonical_form,
    correct_answer: correctWord.translation_en,
    options,
    type: 'translation'
  };
}

export async function getWordById(id: number): Promise<LexicalEntry | undefined> {
  const database = await getDb();
  
  return database.get<LexicalEntry>(`
    SELECT id, lexical_id, canonical_form, definition_en, translation_en
    FROM lexical_entries
    WHERE id = ?
  `, id);
}

export async function searchWords(query: string): Promise<LexicalEntry[]> {
  const database = await getDb();
  
  return database.all<LexicalEntry[]>(`
    SELECT le.id, le.lexical_id, le.canonical_form, le.definition_en, le.translation_en
    FROM lexical_entries_fts fts
    JOIN lexical_entries le ON le.id = fts.rowid
    WHERE lexical_entries_fts MATCH ?
    ORDER BY rank
    LIMIT 20
  `, query);
}