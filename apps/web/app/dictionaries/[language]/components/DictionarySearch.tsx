'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface DictionaryWord {
  word: string;
  definition?: string;
  definitions?: string[];
  type?: string;
}

interface DictionaryMeta {
  name: string;
  description: string;
  region: string;
  code: string;
}

interface DictionarySearchProps {
  dictionary: {
    meta: DictionaryMeta;
    words: DictionaryWord[];
  };
  initialSearch?: string;
}

export default function DictionarySearch({ dictionary, initialSearch = '' }: DictionarySearchProps) {
  const [search, setSearch] = useState(initialSearch);
  const { meta, words } = dictionary;

  const filteredWords = search
    ? words.filter(word => 
        word.word.toLowerCase().includes(search.toLowerCase()) ||
        (word.definition && word.definition.toLowerCase().includes(search.toLowerCase())) ||
        (word.definitions && word.definitions.some(def => def.toLowerCase().includes(search.toLowerCase())))
      )
    : words;

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold tracking-tight">Dictionary Words</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search words..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 rounded-md border bg-background"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dictionary content */}
      <div className="mt-6">
        <div className="space-y-8">
          {/* Results summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {filteredWords.length} of {words.length} words
              {search && <span> matching "{search}"</span>}
            </p>
          </div>

          {filteredWords.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold">No words found</h3>
              <p className="text-muted-foreground mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Word</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Definition</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {filteredWords.map((word) => (
                      <tr 
                        key={word.word}
                        className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                      >
                        <td className="p-4 align-middle">
                          <Link
                            href={`/dictionaries/${meta.code}/words/${encodeURIComponent(word.word)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {word.word}
                          </Link>
                        </td>
                        <td className="p-4 align-middle text-muted-foreground">
                          {word.type || '-'}
                        </td>
                        <td className="p-4 align-middle">
                          {word.definition ? (
                            <p>{word.definition}</p>
                          ) : word.definitions && word.definitions.length > 0 ? (
                            <ul className="list-disc pl-5 space-y-1">
                              {word.definitions.map((def, idx) => (
                                <li key={idx}>{def}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground italic">No definition available</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
