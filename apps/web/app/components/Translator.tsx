'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Globe, Loader2, AlertTriangle } from 'lucide-react';
import { Textarea, Button } from '@mobtranslate/ui';
import { Language } from '@/lib/supabase/types';

interface TranslatorProps {
  availableLanguages?: Language[];
  showExamples?: boolean;
}

const EXAMPLE_PHRASES = [
  { label: 'Hello', text: 'Hello' },
  { label: 'Thank you', text: 'Thank you' },
  { label: 'Water', text: 'Water' },
];

const Translator = ({ availableLanguages, showExamples = false }: TranslatorProps = {}) => {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('kuku_yalanji');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [languages, setLanguages] = useState<Language[]>(availableLanguages || []);
  const [error, setError] = useState<string | null>(null);
  const [canTranslate, setCanTranslate] = useState<boolean>(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available languages on component mount if not provided
  useEffect(() => {
    if (availableLanguages) {
      setLanguages(availableLanguages);
      return;
    }

    const fetchLanguages = async () => {
      try {
        const response = await fetch('/api/v2/languages');
        const data = await response.json();
        if (Array.isArray(data)) {
          setLanguages(data);
        }
      } catch (error) {
        console.error('Error loading languages:', error);
        setError('Failed to load available languages. Please refresh the page.');
      }
    };

    fetchLanguages();
  }, [availableLanguages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
    
    // Update the canTranslate state based on whether there's non-whitespace text
    setCanTranslate(newText.trim().length > 0);
    
    // Clear any previous errors when user starts typing again
    if (error) setError(null);
  };

  const handleTranslate = async () => {
    if (!canTranslate) {
      return;
    }
    
    setIsLoading(true);
    setOutputText('');
    setError(null);
    
    try {
      const response = await fetch(`/api/translate/${selectedLanguage}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          stream: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || 'Translation service unavailable');
      }

      // Reset output text before starting to stream
      setOutputText('');
      
      // Get a reader from the response body
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body reader could not be created');
      }
      
      const decoder = new TextDecoder('utf-8');
      let result = '';
      
      // Process the stream chunk by chunk
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Decode the chunk
        const text = decoder.decode(value, { stream: !done });

        // Update the accumulated result
        result += text;

        // Update the UI - force React to flush updates
        setOutputText(result);
        
        // Force a small delay to allow React to render
        // This is crucial for the streaming effect to be visible
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Scroll to bottom
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }
    } catch (error) {
      console.error('Translation error:', error);
      setError('Translation error occurred. Please try again.');
      setOutputText('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (text: string) => {
    setInputText(text);
    setCanTranslate(text.trim().length > 0);
    if (error) setError(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleTranslate();
    }
  };

  return (
    <>
    <div className="max-w-7xl mx-auto my-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] overflow-hidden">
      {/* Input Section */}
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4 text-[rgba(255,255,255,0.6)]">
          <Globe size={16} />
          <span className="text-sm">Translate from English</span>
        </div>
        <div className="relative mb-4">
          <Textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter English text to translate..."
            aria-label="Translation input"
            aria-describedby="char-counter"
            className="w-full p-4 pr-10 resize-none min-h-[100px] sm:min-h-[120px] text-sm leading-relaxed transition-all duration-200 rounded-xl text-white placeholder:text-[rgba(255,255,255,0.4)]"
            style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' }}
          />
          <div id="char-counter" className="absolute bottom-2 right-2 text-xs text-[rgba(255,255,255,0.5)]">
            {inputText.length} characters
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              aria-label="Select target language"
              className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.08)] text-white focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.2)] text-sm transition-colors duration-200"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-gray-950 text-white">
                  {lang.name || lang.code}
                </option>
              ))}
            </select>
            <Button
              onClick={handleTranslate}
              disabled={!canTranslate}
              className="rounded-lg"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Translating...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ArrowRight size={16} />
                  <span>Translate</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Output Section */}
      {(outputText || error || isLoading) && (
        <div className="border-t border-[rgba(255,255,255,0.1)]">
          <div className="text-white text-base leading-relaxed" aria-live="polite">
            {/* Inner Container with Improved Padding */}
            <div className="py-5 px-6 relative" ref={outputRef}> {/* Added relative positioning */}
              {error ? (
                <div className="text-destructive flex items-start gap-2" role="alert">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              ) : (
                <>
                  {/* Always show content when available */}
                  {outputText && (
                    <ReactMarkdown
                      className=""
                      components={{
                        h1: ({node: _, ...props}) => <h1 {...props} className="text-2xl font-bold mb-4 mt-6 text-inherit border-b pb-1 border-[rgba(255,255,255,0.2)]" />,
                        h2: ({node: _, ...props}) => <h2 {...props} className="text-xl font-bold mb-3 mt-5 text-inherit" />,
                        h3: ({node: _, ...props}) => <h3 {...props} className="text-lg font-semibold mb-3 mt-4 text-inherit" />,
                        p: ({node: _, ...props}) => <p {...props} className="mb-4 leading-relaxed text-inherit" />,
                        ul: ({node: _, ...props}) => <ul {...props} className="list-disc pl-6 mb-4 space-y-2" />,
                        ol: ({node: _, ...props}) => <ol {...props} className="list-decimal pl-6 mb-4 space-y-2" />,
                        li: ({node: _, ...props}) => <li {...props} className="text-inherit" />,
                        blockquote: ({node: _, ...props}) => <blockquote {...props} className="border-l-4 border-[rgba(255,255,255,0.2)] pl-4 italic my-4 text-[rgba(255,255,255,0.6)]" />,
                        a: ({node: _, ...props}) => <a {...props} className="text-blue-400 underline hover:text-blue-300 transition-colors" />,
                        em: ({node: _, ...props}) => <em {...props} className="italic text-inherit" />,
                        strong: ({node: _, ...props}) => <strong {...props} className="font-bold text-inherit" />,
                        code: ({node: _, ...props}) => <code {...props} className=" px-1.5 py-0.5 rounded text-sm font-mono text-inherit" />,
                        pre: ({node: _, ...props}) => <pre {...props} className=" p-4 rounded-md overflow-x-auto mb-4 text-sm font-mono" />,
                        hr: ({node: _, ...props}) => <hr {...props} className="my-6 border-[rgba(255,255,255,0.2)]" />,
                        table: ({node: _, ...props}) => <div className="overflow-x-auto mb-4"><table {...props} className="min-w-full border-collapse text-sm" /></div>,
                        thead: ({node: _, ...props}) => <thead {...props} className="" />,
                        tbody: ({node: _, ...props}) => <tbody {...props} className="divide-y divide-[rgba(255,255,255,0.2)]" />,
                        tr: ({node: _, ...props}) => <tr {...props} className="" />,
                        th: ({node: _, ...props}) => <th {...props} className="px-4 py-2 text-left font-medium text-inherit" />,
                        td: ({node: _, ...props}) => <td {...props} className="px-4 py-2 text-inherit" />
                      }}
                    >
                      {outputText}
                    </ReactMarkdown>
                  )}
                  
                  {/* Show loading indicator as an overlay when loading */}
                  {isLoading && !outputText && (
                    <div className="flex items-center justify-center h-full min-h-[50px]">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  )}
                  
                  {/* Show small loading indicator when both loading and showing text */}
                  {isLoading && outputText && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-[rgba(255,255,255,0.6)] bg-[rgba(0,0,0,0.4)] backdrop-blur-sm px-2 py-1 rounded-sm">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Translating...</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

           <div className="px-6 pb-4 text-xs text-[rgba(255,255,255,0.5)]">
                <p>
                  Note: Translations are generated using AI and may not be 100% accurate.
                  Please consult with language experts for critical translations.
                </p>
            </div>
        </div>
      )}
    </div>
    {showExamples && (
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <span className="text-xs text-[rgba(255,255,255,0.5)] mr-1">Try it:</span>
        {EXAMPLE_PHRASES.map((example) => (
          <button
            key={example.label}
            onClick={() => handleExampleClick(example.text)}
            className="px-3 py-1 text-xs rounded-full border border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.7)] hover:text-white hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.08)] transition-all duration-200"
          >
            {example.label}
          </button>
        ))}
      </div>
    )}
    </>
  );
};

export default Translator;
