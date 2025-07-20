'use client';

import React, { useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import { Send, Bot, User, Sparkles, BookOpen, BarChart3, AlertCircle } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { TranslationResult } from './TranslationResult';
import { WordSuggestions } from './WordSuggestions';
import { LanguageStats } from './LanguageStats';

export function ChatInterface() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, error } = useChat({
    api: '/api/chat',
    maxSteps: 5,
    onError: (error) => {
      console.error('Chat error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const suggestedPrompts = [
    { icon: BookOpen, text: "Help me learn Yupik vocabulary", action: "Help me learn Yupik vocabulary" },
    { icon: Sparkles, text: "Translate 'hello' to all languages", action: "Translate 'hello' to all available languages in the dictionary" },
    { icon: BarChart3, text: "Show my learning progress", action: "Show my learning progress and stats" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text mb-2">
            Language Learning Assistant
          </h1>
          <p className="text-muted-foreground">
            Ask me anything about languages, translations, or your learning progress
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-200">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {error.message || 'An error occurred while processing your request.'}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                Please check the console for more details or ensure your OpenAI API key is configured.
              </p>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 mb-6">
          <div className="h-[60vh] overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="h-12 w-12 mx-auto text-indigo-500 mb-4" />
                <h2 className="text-xl font-semibold mb-4">How can I help you today?</h2>
                <div className="grid gap-3 max-w-2xl mx-auto">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setInput(prompt.action);
                        handleSubmit(new Event('submit') as any);
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl text-left border hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all group"
                    >
                      <prompt.icon className="h-5 w-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{prompt.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === 'user'
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700"
                  )}
                >
                  <div className="space-y-2">
                    {message.toolInvocations?.map((toolInvocation) => {
                      const { toolName, args, state } = toolInvocation;
                      
                      if (state === 'result') {
                        if (toolName === 'translateWord') {
                          return <TranslationResult key={toolInvocation.toolCallId} {...toolInvocation.result} />;
                        } else if (toolName === 'getWordSuggestions') {
                          return <WordSuggestions key={toolInvocation.toolCallId} words={toolInvocation.result} />;
                        } else if (toolName === 'getUserStats') {
                          return <LanguageStats key={toolInvocation.toolCallId} stats={toolInvocation.result} />;
                        }
                      }
                      
                      return null;
                    })}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
                
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about languages..."
            className={cn(
              "w-full px-6 py-4 pr-14 rounded-2xl resize-none",
              "bg-white dark:bg-gray-800",
              "border-2 border-gray-200 dark:border-gray-700",
              "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
              "placeholder:text-gray-400",
              "transition-all duration-200"
            )}
            rows={3}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "absolute right-3 bottom-3 p-3 rounded-xl",
              "bg-gradient-to-r from-indigo-500 to-purple-500",
              "hover:from-indigo-600 hover:to-purple-600",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            )}
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}