'use client';

import React, { useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import { Send, Bot, User, Sparkles, BookOpen, BarChart3, AlertCircle } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';
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
      console.error('Error response:', (error as any).response);
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
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-foreground text-transparent bg-clip-text mb-2">
            Language Learning Assistant
          </h1>
          <p className="text-muted-foreground">
            Ask me anything about languages, translations, or your learning progress
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-error">Error</h3>
              <p className="text-sm text-error/80 mt-1">
                {error.message || 'An error occurred while processing your request.'}
              </p>
              <p className="text-xs text-error/70 mt-2">
                Please check the console for more details or ensure your OpenAI API key is configured.
              </p>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="bg-card rounded-2xl shadow-xl border border-border mb-6">
          <div className="h-[60vh] overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="h-12 w-12 mx-auto text-primary mb-4" />
                <h2 className="text-xl font-semibold mb-4">How can I help you today?</h2>
                <div className="grid gap-3 max-w-2xl mx-auto">
                  {suggestedPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      onClick={() => {
                        setInput(prompt.action);
                        handleSubmit(new Event('submit') as any);
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl text-left border hover:border-primary/30 hover:bg-primary/5 transition-all group h-auto"
                    >
                      <prompt.icon className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{prompt.text}</span>
                    </Button>
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
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === 'user'
                      ? "bg-gradient-to-r from-primary to-primary/70 text-white"
                      : "bg-muted"
                  )}
                >
                  <div className="space-y-2">
                    {message.toolInvocations?.map((toolInvocation) => {
                      const { toolName, args: _args, state } = toolInvocation;
                      
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
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
              "bg-card",
              "border-2 border-border",
              "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring",
              "placeholder:text-muted-foreground",
              "transition-all duration-200"
            )}
            rows={3}
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "absolute right-3 bottom-3 p-3 rounded-xl",
              "bg-gradient-to-r from-primary to-primary/70",
              "hover:from-primary/90 hover:to-primary/60",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <Send className="h-5 w-5 text-white" />
          </Button>
        </form>
      </div>
    </div>
  );
}