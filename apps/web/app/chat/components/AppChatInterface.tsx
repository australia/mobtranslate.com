'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useChat } from 'ai/react';
import { 
  Send,
  Bot,
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
  Mic,
  MoreVertical,
  Image as ImageIcon
} from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';
import { TranslationResult } from './TranslationResult';
import { WordSuggestions } from './WordSuggestions';
import { LanguageStats } from './LanguageStats';
import { ImageAnalysisCard } from './ImageAnalysisCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';


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
    <div className="fixed inset-0 flex bg-muted">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-300 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-r from-primary to-primary/70 flex items-center justify-center text-white text-sm font-bold">
                  MT
                </div>
                <span className="font-semibold">Mob Translate</span>
              </Link>
              <Button
                variant="ghost"
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1"
              >
                <X className="h-5 w-5" />
              </Button>
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
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <link.icon className="h-5 w-5" />
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary/70 flex items-center justify-center text-white text-sm font-bold">
                  {username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{username || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="p-2"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="bg-card border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-semibold">AI Assistant</h1>
                  <p className="text-xs text-muted-foreground">Always here to help</p>
                </div>
              </div>
            </div>
            <Button variant="ghost" className="p-2">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-error">Error</h3>
              <p className="text-sm text-error/80 mt-1">
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
                <Bot className="h-16 w-16 mx-auto text-primary mb-6" />
                <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                <p className="text-muted-foreground mb-8">Ask me anything about languages and translations</p>
                <div className="grid gap-3 max-w-xl mx-auto">
                  {suggestedPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="outline"
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
                      className="flex items-center gap-3 p-4 rounded-xl text-left bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group animate-slide-in h-auto"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <prompt.icon className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{prompt.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              const msg = message as any;
              console.log('[DEBUG] Rendering message:', {
                id: message.id,
                role: message.role,
                contentPreview: message.content?.substring(0, 50) + '...',
                hasAttachments: !!(msg.attachments || msg.experimental_attachments),
                attachmentCount: (msg.attachments || msg.experimental_attachments)?.length || 0,
                attachmentTypes: (msg.attachments || msg.experimental_attachments)?.map((a: any) => a?.contentType)
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
                      : "bg-card border border-border"
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
                        } else if (toolName === 'analyzeImage') {
                          const result = toolInvocation.result;
                          if (result.success && result.analysis) {
                            return <ImageAnalysisCard key={toolInvocation.toolCallId} analysis={result.analysis} />;
                          } else {
                            return (
                              <div key={toolInvocation.toolCallId} className="p-3 bg-error/10 rounded-lg">
                                <p className="text-sm text-error">
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
                    {(msg.attachments || msg.experimental_attachments)?.filter((attachment: any) =>
                      attachment?.contentType?.startsWith('image/')
                    ).map((attachment: any, idx: number) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${message.id}-${idx}`}
                        src={attachment.url}
                        alt={attachment.name || `attachment-${idx}`}
                        className="mt-2 rounded-lg max-w-full h-auto"
                        style={{ maxHeight: '300px' }}
                      />
                    ))}
                  </div>
                </div>
                
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary/70 flex items-center justify-center text-white text-sm font-bold">
                      {username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </div>
                )}
              </div>
            )})}
            
            {isLoading && (
              <div className="flex gap-3 animate-slide-in">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-card border border-border rounded-2xl px-4 py-3">
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
        <div className="border-t border-border bg-card p-4">
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
              <div className="mb-3 p-2 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{uploadedFiles[0].name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setUploadedFiles([])}
                  >
                    Remove
                  </Button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
              
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="p-2"
                title="Upload image"
              >
                {isUploadingImage ? (
                  <div className="h-5 w-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </Button>
              
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl resize-none",
                    "bg-muted",
                    "border-0 focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground",
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

              <Button
                type="button"
                variant="ghost"
                className="p-2"
                title="Voice input"
              >
                <Mic className="h-5 w-5" />
              </Button>

              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "p-2",
                  "bg-gradient-to-r from-primary to-primary/70",
                  "hover:from-primary/90 hover:to-primary/60",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-all duration-200"
                )}
              >
                <Send className="h-5 w-5 text-white" />
              </Button>
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