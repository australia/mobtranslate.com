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

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        let partialText = '';
        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();
          
          if (done) {
            reading = false;
            console.log("Stream reading complete");
          } else {
            const chunk = decoder.decode(value, { stream: true });
            partialText += chunk;
            setOutputText(partialText);
            
            // Auto-scroll the output container as new content arrives
            if (outputRef.current) {
              outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
          }
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
          {/* <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-medium text-foreground">
              {selectedLanguage && languages.find(lang => lang.code === selectedLanguage)?.meta?.name || 'Translation'}
            </h3>
            {outputText && !isLoading && ( // Only show copy if there's output and not loading
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1 border border-input text-sm text-muted-foreground hover:bg-muted hover:text-foreground dark:border-input dark:hover:bg-input dark:hover:text-foreground transition-colors duration-200"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div> */}

          {/* Content Container - No Border, Better Padding */}
          <div className="text-foreground dark:text-foreground text-base leading-relaxed bg-background/50 dark:bg-background/20 rounded-sm"> {/* Removed border, increased font size */}
            {/* Inner Container with Improved Padding */}
            <div className="py-5 px-6" ref={outputRef}> {/* Increased padding */}
              {isLoading ? (
                  <div className="flex items-center justify-center h-full min-h-[50px]">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
              ) : error ? (
                  <div className="text-destructive flex items-start gap-2"> {/* Removed extra p-3/border */}
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                    <p>{error}</p>
                  </div>
              ) : (
                 /* Larger output text with better spacing */
                 <ReactMarkdown className="text-base [&_p]:mb-3 [&_p:last-child]:mb-0">
                   {outputText}
                 </ReactMarkdown>
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
