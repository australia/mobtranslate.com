'use client';

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import yaml from 'js-yaml';
import OpenAI from 'openai';
import ReactMarkdown from 'react-markdown';

const TranslatorContainer = styled.div`
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: white;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const TextArea = styled.textarea`
  width: 100%;
  height: 150px;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  resize: vertical;
  margin-bottom: 1rem;
`;

const TranslationOutput = styled.div`
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;

  h3 {
    margin-top: 0;
    color: #495057;
    margin-bottom: 1rem;
  }

  .translation-text {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #212529;
  }
`;

const ApiKeyInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-left: 10px;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const Translator = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('kuku_yalanji');
  const [dictionary, setDictionary] = useState({});
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [openai, setOpenai] = useState(null);

  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const response = await fetch(`/dictionaries/${selectedLanguage}/dictionary.yaml`);
        const yamlText = await response.text();
        const dict = yaml.load(yamlText);
        setDictionary(dict);
      } catch (error) {
        console.error('Error loading dictionary:', error);
      }
    };

    loadDictionary();
  }, [selectedLanguage]);

  useEffect(() => {
    if (apiKey) {
      const openaiInstance = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });
      setOpenai(openaiInstance);
    }
  }, [apiKey]);

  const createTranslationPrompt = (text, dictionary) => {
    const words = text.toLowerCase().split(/\s+/);
    const dictionaryContext = words
      .map(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');
        if (dictionary.words) {
          const entry = dictionary.words.find(entry => entry.word === cleanWord);
          if (entry) {
            return `"${cleanWord}": ${entry.definitions.join(', ')}`;
          }
        }
        return null;
      })
      .filter(Boolean)
      .join('\n');
      console.log({dictionary, dictionaryContext})
    return `Translate the following English text to ${selectedLanguage}. Here is some context from the ${selectedLanguage} dictionary:\n\n${JSON.stringify(dictionary)}\n\nText to translate: "${text}"\n\nPlease provide the translation, using the dictionary entries where applicable and maintaining the cultural context. If certain words don't have direct translations, use the most contextually appropriate words from the dictionary.`;
  };

  const translateText = async (text) => {
    if (!dictionary || !text) return '';
    if (!openai) {
      // Fallback to basic dictionary translation if no API key
      const words = text.toLowerCase().split(/\s+/);
      const translatedWords = words.map(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');
        if (dictionary.words) {
          const entry = dictionary.words.find(entry => entry.word === cleanWord);
          return entry ? entry.word : word;
        }
        return word;
      });
      return translatedWords.join(' ');
    }

    try {
      setIsLoading(true);
      const prompt = createTranslationPrompt(text, dictionary);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful translator specializing in ${selectedLanguage}. Use the provided dictionary entries to ensure accurate translations while maintaining cultural context.`
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Translation error:', error);
      return 'Translation error occurred. Please try again.';
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value;
    setInputText(newText);
  };

  const handleTranslate = async () => {
    const translation = await translateText(inputText);
    setOutputText(translation);
  };

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  return (
    <TranslatorContainer>
      <ApiKeyInput
        type="password"
        placeholder="Enter your OpenAI API key"
        value={apiKey}
        onChange={handleApiKeyChange}
      />
      <Select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
        <option value="kuku_yalanji">Kuku Yalanji</option>
      </Select>
      <TextArea
        value={inputText}
        onChange={handleInputChange}
        placeholder="Enter text to translate..."
      />
      <Button onClick={handleTranslate} disabled={!inputText || isLoading}>
        Translate {isLoading && <LoadingSpinner />}
      </Button>
      {outputText && (
        <TranslationOutput>
          <h3>Translation</h3>
          <div className="translation-text">
            <ReactMarkdown>{outputText}</ReactMarkdown>
          </div>
        </TranslationOutput>
      )}
    </TranslatorContainer>
  );
};

export default Translator;
