'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Globe, Loader2, RefreshCw, AlertTriangle, Check, Copy } from 'lucide-react';

const Translator = () => {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('kuku_yalanji');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [languages, setLanguages] = useState<{code: string, meta: any}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [canTranslate, setCanTranslate] = useState<boolean>(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available languages on component mount
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await fetch('/api/dictionaries');
        const data = await response.json();
        if (data.success) {
          setLanguages(data.data);
        }
      } catch (error) {
        console.error('Error loading languages:', error);
        setError('Failed to load available languages. Please refresh the page.');
      }
    };

    fetchLanguages();
  }, []);

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

  const copyToClipboard = () => {
    if (outputText && navigator.clipboard) {
      navigator.clipboard.writeText(outputText)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
        });
    }
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

  // Reset the form
  const resetForm = () => {
    setInputText('');
    setOutputText('');
    setError(null);
    setCanTranslate(false);
    setCopied(false);
  };

  return (
    // Remove shadow, card background, and rounded corners
    <div className="max-w-7xl mx-auto my-8 border border-border">
      {/* Input Section - Remove card background */}
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4 text-muted-foreground">
          <Globe size={16} />
          <span>Translate from English</span>
        </div>
        <div className="relative mb-4">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter English text to translate..."
            className="w-full p-4 pr-10 border border-input bg-background text-foreground dark:text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[100px] sm:min-h-[150px] text-sm leading-relaxed transition-all duration-200"
          />
          <div 
            className="absolute bottom-2 right-2 text-xs text-muted-foreground"
          >
            {inputText.length} characters
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-4 py-1.5 border border-input bg-background text-foreground dark:bg-input dark:border-input dark:text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm transition-colors duration-200"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.meta?.name || lang.code}
                </option>
              ))}
            </select>
            <button
              onClick={handleTranslate}
              disabled={!canTranslate}
              className={`px-4 py-1.5 text-sm font-medium transition-all ${ 
                canTranslate
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                  : "border border-input text-muted-foreground cursor-not-allowed opacity-50 dark:border-input dark:text-muted-foreground"
              }`}
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
            </button>
          </div>
        </div>
      </div>

      {/* Output Section */}
      {(outputText || error || isLoading) && ( // Ensure container shows for loading state too
        <div className="mt-6"> {/* Outer container, no padding/border */}
          {/* Content Container - No Border, Better Padding */}
          <div className="text-foreground dark:text-foreground text-base leading-relaxed bg-background/50 dark:bg-background/20 rounded-sm"> {/* Removed border, increased font size */}
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
                      className="text-base prose prose-sm dark:prose-invert max-w-none"
                      components={{
                        h1: ({node, ...props}) => <h1 {...props} className="text-2xl font-bold mb-4 mt-6 text-foreground border-b pb-1 border-border" />,
                        h2: ({node, ...props}) => <h2 {...props} className="text-xl font-bold mb-3 mt-5 text-foreground" />,
                        h3: ({node, ...props}) => <h3 {...props} className="text-lg font-semibold mb-3 mt-4 text-foreground" />,
                        p: ({node, ...props}) => <p {...props} className="mb-4 leading-relaxed text-foreground" />,
                        ul: ({node, ...props}) => <ul {...props} className="list-disc pl-6 mb-4 space-y-2" />,
                        ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-6 mb-4 space-y-2" />,
                        li: ({node, ...props}) => <li {...props} className="text-foreground" />,
                        blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-border pl-4 italic my-4 text-muted-foreground" />,
                        a: ({node, ...props}) => <a {...props} className="text-primary underline hover:text-primary/80 transition-colors" />,
                        em: ({node, ...props}) => <em {...props} className="italic text-foreground" />,
                        strong: ({node, ...props}) => <strong {...props} className="font-bold text-foreground" />,
                        code: ({node, ...props}) => <code {...props} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" />,
                        pre: ({node, ...props}) => <pre {...props} className="bg-muted p-4 rounded-md overflow-x-auto mb-4 text-sm font-mono" />,
                        hr: ({node, ...props}) => <hr {...props} className="my-6 border-border" />,
                        table: ({node, ...props}) => <div className="overflow-x-auto mb-4"><table {...props} className="min-w-full border-collapse text-sm" /></div>,
                        thead: ({node, ...props}) => <thead {...props} className="bg-muted/50" />,
                        tbody: ({node, ...props}) => <tbody {...props} className="divide-y divide-border" />,
                        tr: ({node, ...props}) => <tr {...props} className="" />,
                        th: ({node, ...props}) => <th {...props} className="px-4 py-2 text-left font-medium text-foreground" />,
                        td: ({node, ...props}) => <td {...props} className="px-4 py-2 text-foreground" />
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

           <div className="p-6 mt-3 text-xs text-muted-foreground">
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
