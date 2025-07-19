'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Globe, Loader2, RefreshCw, AlertTriangle, Check, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components';
import { Button } from '@ui/components';
import { Textarea } from '@ui/components';
import { Select } from '@ui/components';
import { Alert } from '@ui/components';
import { Badge } from '@ui/components';

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
    <div className="w-full max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-crimson">AI-Powered Translation</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={resetForm}
              disabled={!inputText}
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Input Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium font-crimson">English</h3>
              <Badge variant="outline">{inputText.length} characters</Badge>
            </div>
            
            <Textarea
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter English text to translate..."
              className="h-32 font-source-sans"
            />
            
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-source-sans">Translate to:</span>
                <Select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.meta?.name || lang.code}
                    </option>
                  ))}
                </Select>
              </div>
              
              <Button
                onClick={handleTranslate}
                disabled={!canTranslate || isLoading}
                className="min-w-[120px]"
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

          {/* Output Section */}
          {(outputText || error) && (
            <div className="space-y-4 pt-6 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium font-crimson">
                  {selectedLanguage && languages.find(lang => lang.code === selectedLanguage)?.meta?.name || 'Translation'}
                </h3>
                {outputText && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <div className="flex items-center gap-1">
                        <Check size={14} />
                        <span>Copied</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Copy size={14} />
                        <span>Copy</span>
                      </div>
                    )}
                  </Button>
                )}
              </div>
              
              {error ? (
                <Alert variant="error">
                  <AlertTriangle size={16} />
                  {error}
                </Alert>
              ) : (
                <div 
                  ref={outputRef}
                  className="p-4 bg-muted rounded-md border prose prose-sm max-w-none font-source-sans"
                >
                  <ReactMarkdown>{outputText}</ReactMarkdown>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground font-source-sans">
                <p>
                  <strong>Note:</strong> Translations are generated using AI and may not be 100% accurate.
                  Please consult with language experts for critical translations.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Translator;
