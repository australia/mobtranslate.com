'use client';

import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Card, CardContent } from './card';
import { Textarea } from './Textarea';
import { Select } from './Select';
import { Button } from './Button';
import { Label } from './Label';
import { LoadingState } from './LoadingSpinner';

export interface TranslationInterfaceProps {
  languages: Array<{ code: string; name: string }>;
  onTranslate?: (text: string, targetLanguage: string) => Promise<string>;
  className?: string;
}

const TranslationInterface: React.FC<TranslationInterfaceProps> = ({ languages, onTranslate, className }) => {
    const [sourceText, setSourceText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [selectedLanguage, setSelectedLanguage] = useState(languages[0]?.code || '');
    const [isTranslating, setIsTranslating] = useState(false);

    const handleTranslate = async () => {
      if (!sourceText.trim() || !onTranslate) return;
      
      setIsTranslating(true);
      try {
        const result = await onTranslate(sourceText, selectedLanguage);
        setTranslatedText(result);
      } catch (error) {
        console.error('Translation failed:', error);
        setTranslatedText('Translation failed. Please try again.');
      } finally {
        setIsTranslating(false);
      }
    };

    return (
      <Card className={cn('p-6', className)}>
        <CardContent className="p-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-crimson">English</Label>
              <Textarea
                placeholder="Enter text to translate..."
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="h-32 font-source-sans"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="font-crimson">
                {languages.find(lang => lang.code === selectedLanguage)?.name || 'Translation'}
              </Label>
              <div className="bg-muted rounded-md p-3 h-32 overflow-y-auto">
                {isTranslating ? (
                  <LoadingState>Translating...</LoadingState>
                ) : translatedText ? (
                  <p className="font-source-sans">{translatedText}</p>
                ) : (
                  <p className="text-muted-foreground italic font-source-sans">
                    Translation will appear here...
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Label className="font-crimson">Target Language:</Label>
              <Select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="min-w-[150px]"
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </Select>
            </div>
            
            <Button
              onClick={handleTranslate}
              disabled={!sourceText.trim() || isTranslating}
              className="font-source-sans"
            >
              {isTranslating ? 'Translating...' : 'Translate'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

export { TranslationInterface };