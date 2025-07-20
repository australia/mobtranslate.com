'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useChat } from 'ai/react';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  BookOpen, 
  BarChart3, 
  AlertCircle,
  Menu,
  X,
  Home,
  MessageCircle,
  Settings,
  LogOut,
  ChevronLeft,
  Mic,
  Paperclip,
  MoreVertical,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { TranslationResult } from './TranslationResult';
import { WordSuggestions } from './WordSuggestions';
import { LanguageStats } from './LanguageStats';
import { ImageAnalysisCard } from './ImageAnalysisCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { ImageAnalysis } from '@/lib/tools/image-analysis';

export function AppChatInterface() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, error, append } = useChat({
    api: '/api/chat',
    maxSteps: 5,
    onError: (error) => {
      console.error('[DEBUG] Chat error:', error);
    },
    onFinish: (message) => {
      console.log('[DEBUG] Message finished:', message);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetchUsername();
  }, [user]);

  // Debug effect to monitor uploadedFiles state
  useEffect(() => {
    console.log('[DEBUG] uploadedFiles state changed:', uploadedFiles);
  }, [uploadedFiles]);

  const fetchUsername = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setUsername(data.profile?.display_name || data.profile?.username);
      }
    } catch (error) {
      console.error('Failed to fetch username:', error);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('[DEBUG] Enter key pressed, uploadedFiles:', uploadedFiles);
      
      if (uploadedFiles.length > 0) {
        // Use append to send message with attachments
        await append({
          role: 'user',
          content: input,
          experimental_attachments: uploadedFiles,
        });
        setInput('');
      } else {
        // Use regular handleSubmit for messages without attachments
        const formEvent = e as any;
        handleSubmit(formEvent);
      }
      
      setUploadedFiles([]);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[DEBUG] handleImageUpload called');
    const file = e.target.files?.[0];
    console.log('[DEBUG] Selected file:', file ? { name: file.name, type: file.type, size: file.size } : 'No file');
    
    if (!file) {
      console.log('[DEBUG] No file selected, returning');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('[DEBUG] Invalid file type:', file.type);
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.error('[DEBUG] File too large:', file.size);
      alert('Image size must be less than 5MB');
      return;
    }

    setIsUploadingImage(true);
    try {
      // Convert file to base64 for proper attachment format
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        console.log('[DEBUG] File converted to base64, length:', base64.length);
        
        // Create attachment in the format expected by Vercel AI SDK
        const attachment = {
          name: file.name,
          contentType: file.type,
          url: base64,
        };
        
        console.log('[DEBUG] Setting uploadedFiles with attachment:', attachment);
        setUploadedFiles([attachment as any]);
        setIsUploadingImage(false);
        
        // Focus on the input field for user to type their message
        inputRef.current?.focus();
      };
      
      reader.onerror = () => {
        console.error('[DEBUG] FileReader error');
        alert('Failed to read image file');
        setIsUploadingImage(false);
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('[DEBUG] Error in handleImageUpload:', error);
      alert('Failed to upload image');
      setIsUploadingImage(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const suggestedPrompts = [
    { icon: BookOpen, text: "Help me learn Yupik vocabulary", action: "Help me learn Yupik vocabulary" },
    { icon: Sparkles, text: "Translate 'hello' to all languages", action: "Translate 'hello' to all available languages in the dictionary" },
    { icon: BarChart3, text: "Show my learning progress", action: "Show my learning progress and stats" },
  ];

  const sidebarLinks = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { href: '/learn', icon: BookOpen, label: 'Learn' },
    { href: '/chat', icon: MessageCircle, label: 'AI Chat', active: true },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="fixed inset-0 flex bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  MT
                </div>
                <span className="font-semibold">Mob Translate</span>
              </Link>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {sidebarLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  link.active 
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" 
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                <link.icon className="h-5 w-5" />
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  {username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{username || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-semibold">AI Assistant</h1>
                  <p className="text-xs text-gray-500">Always here to help</p>
                </div>
              </div>
            </div>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-200">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {error.message || 'An error occurred while processing your request.'}
              </p>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="h-16 w-16 mx-auto text-indigo-500 mb-6" />
                <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                <p className="text-gray-500 mb-8">Ask me anything about languages and translations</p>
                <div className="grid gap-3 max-w-xl mx-auto">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={async () => {
                        setInput(prompt.action);
                        
                        if (uploadedFiles.length > 0) {
                          await append({
                            role: 'user',
                            content: prompt.action,
                            experimental_attachments: uploadedFiles,
                          });
                          setInput('');
                        } else {
                          const formEvent = new Event('submit') as any;
                          handleSubmit(formEvent);
                        }
                        
                        setUploadedFiles([]);
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all group animate-slide-in"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <prompt.icon className="h-5 w-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{prompt.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              console.log('[DEBUG] Rendering message:', {
                id: message.id,
                role: message.role,
                contentPreview: message.content?.substring(0, 50) + '...',
                hasAttachments: !!(message.attachments || message.experimental_attachments),
                attachmentCount: (message.attachments || message.experimental_attachments)?.length || 0,
                attachmentTypes: (message.attachments || message.experimental_attachments)?.map(a => a?.contentType)
              });
              return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-slide-in",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
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
                      : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
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
                        } else if (toolName === 'analyzeImage') {
                          const result = toolInvocation.result;
                          if (result.success && result.analysis) {
                            return <ImageAnalysisCard key={toolInvocation.toolCallId} analysis={result.analysis} />;
                          } else {
                            return (
                              <div key={toolInvocation.toolCallId} className="p-3 bg-red-50 rounded-lg">
                                <p className="text-sm text-red-700">
                                  {result.error || 'Failed to analyze image'}
                                </p>
                              </div>
                            );
                          }
                        }
                      }
                      
                      return null;
                    })}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    
                    {/* Display attached images */}
                    {(message.attachments || message.experimental_attachments)?.filter(attachment => 
                      attachment?.contentType?.startsWith('image/')
                    ).map((attachment, index) => (
                      <img
                        key={`${message.id}-${index}`}
                        src={attachment.url}
                        alt={attachment.name || `attachment-${index}`}
                        className="mt-2 rounded-lg max-w-full h-auto"
                        style={{ maxHeight: '300px' }}
                      />
                    ))}
                  </div>
                </div>
                
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                      {username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </div>
                )}
              </div>
            )})}
            
            {isLoading && (
              <div className="flex gap-3 animate-slide-in">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
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
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              console.log('[DEBUG] Form submitted with uploadedFiles:', uploadedFiles);
              console.log('[DEBUG] Input value:', input);
              
              if (uploadedFiles.length > 0) {
                // Use append to send message with attachments
                await append({
                  role: 'user',
                  content: input,
                  experimental_attachments: uploadedFiles,
                });
                setInput('');
              } else {
                // Use regular handleSubmit for messages without attachments
                handleSubmit(e);
              }
              
              setUploadedFiles([]);
            }}
            className="max-w-3xl mx-auto"
          >
            {/* Show uploaded image preview */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">{uploadedFiles[0].name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadedFiles([])}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <img 
                  src={uploadedFiles[0].url} 
                  alt={uploadedFiles[0].name}
                  className="mt-2 rounded max-h-32 object-contain"
                />
              </div>
            )}
            
            <div className="relative flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className={cn(
                  "p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors",
                  isUploadingImage && "opacity-50 cursor-not-allowed"
                )}
                title="Upload image"
              >
                {isUploadingImage ? (
                  <div className="h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </button>
              
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl resize-none",
                    "bg-gray-100 dark:bg-gray-700",
                    "border-0 focus:outline-none focus:ring-2 focus:ring-indigo-500",
                    "placeholder:text-gray-400",
                    "transition-all duration-200"
                  )}
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                  }}
                />
              </div>

              <button
                type="button"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Voice input"
              >
                <Mic className="h-5 w-5" />
              </button>
              
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "p-2 rounded-lg",
                  "bg-gradient-to-r from-indigo-500 to-purple-500",
                  "hover:from-indigo-600 hover:to-purple-600",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-all duration-200"
                )}
              >
                <Send className="h-5 w-5 text-white" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}