'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Globe, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

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
    <div className="max-w-4xl mx-auto my-8 p-6 bg-card rounded-xl shadow-md border border-border/30 transition-all hover:shadow-lg">
      <div className="flex items-center mb-6">
        <Globe className="w-6 h-6 text-primary mr-2" />
        <h2 className="text-2xl font-semibold">Aboriginal Language Translator</h2>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-1/3">
          <label htmlFor="language-select" className="block text-sm font-medium mb-2 text-muted-foreground">
            Translate to
          </label>
          <select 
            id="language-select"
            value={selectedLanguage} 
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="w-full p-3 border border-input bg-background rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            {languages.length > 0 ? (
              languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.meta.name}
                </option>
              ))
            ) : (
              <option value="kuku_yalanji">Kuku Yalanji</option>
            )}
          </select>
        </div>
        
        <div className="w-full md:w-2/3">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="input-text" className="block text-sm font-medium text-muted-foreground">
              English text
            </label>
            <span className="text-xs text-muted-foreground">Press Ctrl+Enter to translate</span>
          </div>
          <textarea
            id="input-text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter text to translate..."
            className="w-full h-24 p-4 border border-input bg-background rounded-lg resize-y mb-4 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
      </div>
      
      <div className="flex justify-end mb-6">
        <div className="flex gap-2">
          <button
            onClick={resetForm}
            className="px-4 py-2.5 bg-muted text-muted-foreground border border-input rounded-lg cursor-pointer hover:bg-muted/80 transition-colors flex items-center gap-2"
            type="button"
          >
            <RefreshCw size={16} />
            Reset
          </button>
          <button 
            onClick={handleTranslate} 
            disabled={!canTranslate || isLoading}
            className="px-5 py-2.5 bg-primary text-primary-foreground border-none rounded-lg cursor-pointer hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Translating...
              </>
            ) : (
              <>
                Translate
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}

      {outputText && !error && (
        <div className="mt-6 rounded-lg border border-border overflow-hidden">
          <div className="bg-muted p-3 flex justify-between items-center">
            <h3 className="text-lg font-medium">Translation</h3>
            <button 
              onClick={copyToClipboard}
              className="text-xs px-3 py-1.5 bg-background hover:bg-primary/10 text-foreground rounded-md transition-colors"
            >
              {copied ? 'Copied!' : 'Copy text'}
            </button>
          </div>
          <div 
            ref={outputRef}
            className="p-5 bg-background max-h-[300px] overflow-y-auto"
          >
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown>{outputText}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-6 text-xs text-muted-foreground text-center">
        Powered by community-maintained dictionaries. Translations may not be perfect.
      </div>
    </div>
  );
};

export default Translator;
