'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, SearchInput, Badge, EmptyState, Button, DictionaryTable } from '@ui/components';

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

  const handleWordClick = (word: string) => {
    // This will be handled by the Link in DictionaryTable component
    return `/dictionaries/${meta.code}/words/${encodeURIComponent(word)}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="font-crimson">Dictionary Words</CardTitle>
            <div className="flex items-center gap-4">
              <SearchInput
                placeholder="Search words and definitions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-80"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {filteredWords.length} of {words.length} words
              </Badge>
              {search && (
                <Badge variant="secondary">
                  Searching: "{search}"
                </Badge>
              )}
            </div>
          </div>

          {filteredWords.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={search ? "No words found" : "No words available"}
              description={search ? `No words match "${search}". Try a different search term.` : "This dictionary doesn't have any words yet."}
              action={
                search ? (
                  <Button variant="outline" onClick={() => setSearch('')}>
                    Clear Search
                  </Button>
                ) : null
              }
            />
          ) : (
            <DictionaryTable 
              words={filteredWords}
              onWordClick={(word) => window.location.href = handleWordClick(word)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
