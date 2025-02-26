'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

const Translator = () => {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('kuku_yalanji');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [languages, setLanguages] = useState<{code: string, meta: any}[]>([]);

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
      }
    };

    fetchLanguages();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return; // Check for empty or whitespace-only input
    
    setIsLoading(true);
    setOutputText('');
    
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
        throw new Error('Network response was not ok');
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
          } else {
            const chunk = decoder.decode(value, { stream: true });
            partialText += chunk;
            setOutputText(partialText);
          }
        }
      }
    } catch (error) {
      console.error('Translation error:', error);
      setOutputText('Translation error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-8 p-8 bg-white rounded-lg shadow-md">
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <select 
          value={selectedLanguage} 
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md text-base"
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
      
      <textarea
        value={inputText}
        onChange={handleInputChange}
        placeholder="Enter text to translate..."
        className="w-full h-36 p-4 border border-gray-300 rounded-md text-base resize-y mb-4"
      />
      <button 
        onClick={handleTranslate} 
        disabled={!inputText.trim() || isLoading}
        className="px-4 py-2 bg-blue-500 text-white border-none rounded-md text-base cursor-pointer mt-4 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Translate {isLoading && (
          <span className="inline-block w-5 h-5 ml-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        )}
      </button>
      {outputText && (
        <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="mt-0 text-gray-700 mb-4">Translation</h3>
          <div className="text-lg leading-relaxed text-gray-800">
            <ReactMarkdown>{outputText}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default Translator;
