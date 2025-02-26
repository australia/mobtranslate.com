'use client';

import React, { useState, useEffect } from 'react';
import yaml from 'js-yaml';
import OpenAI from 'openai';
import ReactMarkdown from 'react-markdown';

interface DictionaryWord {
  word: string;
  definitions: string[];
}

interface Dictionary {
  words?: DictionaryWord[];
  [key: string]: any;
}

const Translator = () => {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('kuku_yalanji');
  const [dictionary, setDictionary] = useState<Dictionary>({});
  const [apiKey, setApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [openai, setOpenai] = useState<OpenAI | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const response = await fetch(`/dictionaries/${selectedLanguage}/dictionary.yaml`);
        const yamlText = await response.text();
        const dict = yaml.load(yamlText) as Dictionary;
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

  const createTranslationPrompt = (text: string, dictionary: Dictionary) => {
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
      console.log({dictionary, dictionaryContext});

      const neoPrompt = `
      You are a skilled translator specializing in ${selectedLanguage}, with a deep understanding of its cultural and linguistic nuances. Your goal is to accurately translate the provided text while preserving its meaning, tone, and cultural context.
      
      Context:
      - **Language**: ${selectedLanguage}
      - **Dictionary Reference**: ${JSON.stringify(dictionary)}
      
      Task:
      Translate the following text:
      "${text}"
      
      Guidelines:
      1. Use entries from the provided dictionary wherever applicable to ensure accuracy and consistency.  
      2. If a word or phrase lacks a direct translation, choose the most culturally and contextually appropriate alternative based on the dictionary and your expertise.  
      3. Strive to maintain the tone, meaning, and intent of the original text.  
      4. Where ambiguity exists, prioritize conveying the intended message rather than a literal translation.
      
      Output:
      Provide the translation as a standalone text. If relevant, include brief annotations explaining significant translation choices, especially for culturally nuanced terms.
      `;
      

    const avanisShit = `
    An aboriginal woman from Darwin wrote this;

    ancestory feeling, instinctual impulse, nothing comprehensive, just feeling and messsaging from something beyond spirituality and words. A connection that coonot be taught, only felt and leant into. Grief and growth, joy and genes. Less english and more heart. Following gods that can be touched and felt. It's a physically tangible connection to the earth, to the stories not told but still instilled and fulfilled in how me move and make choices and interact with the world. It's the past and the future. It's the way family is more than mom and dad and --brother and sister, it's human heart and the grounds heart and the heart in the air and the skin in the clay. More than god and more than human. Ingrained and inescapable. ancestory feeling, instinctual impulse, nothing comprehensive, just feeling and messsaging from something beyond spirituality and words. A connection that coonot be taught, only felt and leant into. Grief and growth, joy and genes. Less english and more heart. Following gods that can be touched and felt. It's a physically tangible connection to the earth, to the stories not told but still instilled and fulfilled in how me move and make choices and interact with the world. It's the past and the future. It's the way family is more than mom and dad and --brother and sister, it's human heart and the grounds heart and the heart in the air and the skin in the clay. More than god and more than human. Ingrained and inescapable.`;

    const studiousPrompt = `
    Break down the translation process into clear, informal steps:
    
    1. **Literal Translation**: Start with a direct, word-for-word translation of the text.  
    2. **Word Analysis**: For each word:
       - Provide a detailed breakdown, including etymology and related meanings.  
       - Explore alternative words or interpretations from other contexts or languages.  
       - Be thorough and descriptive.  
    3. **Cross-Language Connections**: Compare and relate the words or phrases to other languages you know, identifying similarities or differences in meaning and usage.  
    
    Conclude by synthesizing these steps into a cohesive and thoughtful translation.
    `;
    const thePrompt = [neoPrompt, avanisShit, studiousPrompt ].join('\n\n'); 
      console.log(thePrompt);
      return thePrompt;
  };

  const translateText = async (text: string): Promise<string> => {
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

      return completion.choices[0].message.content || 'No translation content returned.';
    } catch (error) {
      console.error('Translation error:', error);
      return 'Translation error occurred. Please try again.';
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
  };

  const handleTranslate = async () => {
    const translation = await translateText(inputText);
    setOutputText(translation);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  return (
    <div className="max-w-3xl mx-auto my-8 p-8 bg-white rounded-lg shadow-md">
      <input
        type="password"
        placeholder="Enter your OpenAI API key"
        value={apiKey}
        onChange={handleApiKeyChange}
        className="w-full p-2 mb-4 border border-gray-300 rounded-md text-base"
      />
      <select 
        value={selectedLanguage} 
        onChange={(e) => setSelectedLanguage(e.target.value)}
        className="w-full p-2 mb-4 border border-gray-300 rounded-md text-base"
      >
        <option value="kuku_yalanji">Kuku Yalanji</option>
      </select>
      <textarea
        value={inputText}
        onChange={handleInputChange}
        placeholder="Enter text to translate..."
        className="w-full h-36 p-4 border border-gray-300 rounded-md text-base resize-y mb-4"
      />
      <button 
        onClick={handleTranslate} 
        disabled={!inputText || isLoading}
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
