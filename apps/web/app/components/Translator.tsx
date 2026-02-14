'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Globe, Loader2, AlertTriangle } from 'lucide-react';
import { Textarea, Button } from '@mobtranslate/ui';
import { Language } from '@/lib/supabase/types';

interface TranslatorProps {
  availableLanguages?: Language[];
}

const Translator = ({ availableLanguages }: TranslatorProps = {}) => {
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

  // Log state changes for debugging
  useEffect(() => {
    console.log("State updated - canTranslate:", canTranslate, "inputText:", inputText, "isLoading:", isLoading);
  }, [canTranslate, inputText, isLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
    
    // Update the canTranslate state based on whether there's non-whitespace text
    setCanTranslate(newText.trim().length > 0);
    
    // Clear any previous errors when user starts typing again
    if (error) setError(null);
    
    // For debugging
    console.log("Input text changed:", newText, "Length:", newText.length, "Trimmed length:", newText.trim().length, "Can translate:", newText.trim().length > 0);
  };

  const handleTranslate = async () => {
    if (!canTranslate) {
      console.log("Cannot translate: Input text is empty after trimming");
      return;
    }
    
    setIsLoading(true);
    setOutputText('');
    setError(null);
    
    try {
      console.log(`Sending translation request for: "${inputText}"`);
      
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
        console.error(`Translation API error (${response.status}):`, errorData);
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
          console.log('Stream complete');
          break;
        }
        
        // Decode the chunk
        const text = decoder.decode(value, { stream: !done });
        console.log('Received chunk:', text);
        
        // Update the accumulated result
        result += text;
        
        // Update the UI - force React to flush updates
        setOutputText(result);
        console.log('Updated output text to:', result);
        
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleTranslate();
    }
  };

  return (
    <div className="max-w-7xl mx-auto my-8 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Input Section */}
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4 text-white/60">
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
            className="w-full p-4 pr-10 resize-none min-h-[100px] sm:min-h-[120px] text-sm leading-relaxed transition-all duration-200 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
          <div
            className="absolute bottom-2 right-2 text-xs text-muted-foreground"
          >
            {inputText.length} characters
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-4 py-2 rounded-lg border border-white/20 bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/30 text-sm transition-colors duration-200 backdrop-blur-sm"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-gray-900 text-white">
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
        <div className="border-t border-white/10">
          <div className="text-white text-base leading-relaxed">
            {/* Inner Container with Improved Padding */}
            <div className="py-5 px-6 relative" ref={outputRef}> {/* Added relative positioning */}
              {error ? (
                <div className="text-destructive flex items-start gap-2"> 
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
                        h1: ({_node, ...props}) => <h1 {...props} className="text-2xl font-bold mb-4 mt-6 text-foreground border-b pb-1 border-border" />,
                        h2: ({_node, ...props}) => <h2 {...props} className="text-xl font-bold mb-3 mt-5 text-foreground" />,
                        h3: ({_node, ...props}) => <h3 {...props} className="text-lg font-semibold mb-3 mt-4 text-foreground" />,
                        p: ({_node, ...props}) => <p {...props} className="mb-4 leading-relaxed text-foreground" />,
                        ul: ({_node, ...props}) => <ul {...props} className="list-disc pl-6 mb-4 space-y-2" />,
                        ol: ({_node, ...props}) => <ol {...props} className="list-decimal pl-6 mb-4 space-y-2" />,
                        li: ({_node, ...props}) => <li {...props} className="text-foreground" />,
                        blockquote: ({_node, ...props}) => <blockquote {...props} className="border-l-4 border-border pl-4 italic my-4 text-muted-foreground" />,
                        a: ({_node, ...props}) => <a {...props} className="text-primary underline hover:text-primary/80 transition-colors" />,
                        em: ({_node, ...props}) => <em {...props} className="italic text-foreground" />,
                        strong: ({_node, ...props}) => <strong {...props} className="font-bold text-foreground" />,
                        code: ({_node, ...props}) => <code {...props} className=" px-1.5 py-0.5 rounded text-sm font-mono text-foreground" />,
                        pre: ({_node, ...props}) => <pre {...props} className=" p-4 rounded-md overflow-x-auto mb-4 text-sm font-mono" />,
                        hr: ({_node, ...props}) => <hr {...props} className="my-6 border-border" />,
                        table: ({_node, ...props}) => <div className="overflow-x-auto mb-4"><table {...props} className="min-w-full border-collapse text-sm" /></div>,
                        thead: ({_node, ...props}) => <thead {...props} className="" />,
                        tbody: ({_node, ...props}) => <tbody {...props} className="divide-y divide-border" />,
                        tr: ({_node, ...props}) => <tr {...props} className="" />,
                        th: ({_node, ...props}) => <th {...props} className="px-4 py-2 text-left font-medium text-foreground" />,
                        td: ({_node, ...props}) => <td {...props} className="px-4 py-2 text-foreground" />
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
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-sm">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Translating...</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

           <div className="px-6 pb-4 text-xs text-white/40">
                <p>
                  Note: Translations are generated using AI and may not be 100% accurate.
                  Please consult with language experts for critical translations.
                </p>
            </div>
        </div>
      )}
    </div>
  );
};

export default Translator;
