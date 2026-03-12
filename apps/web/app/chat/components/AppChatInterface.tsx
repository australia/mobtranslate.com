'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  Image as ImageIcon,
  Globe,
  Languages,
  GraduationCap,
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

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
    { icon: Languages, text: "Translate 'hello' to Kuku Yalanji", action: "Translate 'hello' to Kuku Yalanji" },
    { icon: Globe, text: "Tell me about the Wajarri language", action: "Tell me about the Wajarri language" },
    { icon: GraduationCap, text: "What words should I learn first?", action: "What words should I learn first?" },
    { icon: BookOpen, text: "Help me learn Yupik vocabulary", action: "Help me learn Yupik vocabulary" },
  ];

  const sidebarLinks = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { href: '/learn', icon: BookOpen, label: 'Learn' },
    { href: '/chat', icon: MessageCircle, label: 'AI Chat', active: true },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  const renderMarkdown = (text: string) => {
    // Simple markdown rendering: bold, italic, code, line breaks
    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>')
      .replace(/\n/g, '<br />');
    return html;
  };

  return (
    <div className="fixed inset-0 flex bg-background">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-sm font-bold shadow-sm">
                  MT
                </div>
                <span className="font-semibold text-foreground">Mob Translate</span>
              </Link>
              <Button
                variant="ghost"
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5">
            {sidebarLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  link.active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="h-[18px] w-[18px]" />
                <span className="text-sm">{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
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
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <header className="bg-card/80 backdrop-blur-xl border-b border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
                </div>
                <div>
                  <h1 className="font-semibold text-foreground leading-tight">AI Language Assistant</h1>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Indigenous language specialist
                  </p>
                </div>
              </div>
            </div>
            <Button variant="ghost" className="p-2 rounded-lg text-muted-foreground">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 max-w-4xl self-center w-full">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-slide-in">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-500 text-sm">Something went wrong</h3>
                <p className="text-sm text-red-400 mt-1">
                  {error.message || 'An error occurred while processing your request.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {/* Empty State */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 animate-slide-in">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-6 shadow-lg">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2 text-center">
                  Ask me about Indigenous languages
                </h2>
                <p className="text-muted-foreground mb-10 text-center max-w-md">
                  I can help you translate words, learn vocabulary, and explore the rich diversity of Indigenous Australian languages.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
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
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-2xl text-left",
                        "bg-card border border-border",
                        "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm",
                        "transition-all duration-200 group",
                        "animate-slide-in"
                      )}
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <prompt.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground leading-snug">
                        {prompt.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
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

              const isUser = message.role === 'user';

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3 animate-slide-in",
                    isUser ? "justify-end" : "justify-start"
                  )}
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
                >
                  {/* AI Avatar */}
                  {!isUser && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}

                  <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start", "max-w-[80%]")}>
                    {/* Message Bubble */}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card border border-border rounded-bl-md shadow-sm"
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
                                  <div key={toolInvocation.toolCallId} className="p-3 bg-red-500/10 rounded-lg">
                                    <p className="text-sm text-red-500">
                                      {result.error || 'Failed to analyze image'}
                                    </p>
                                  </div>
                                );
                              }
                            }
                          }

                          return null;
                        })}

                        {message.content && (
                          isUser ? (
                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
                          ) : (
                            <div
                              className="whitespace-pre-wrap text-[15px] leading-relaxed prose-sm [&_strong]:font-semibold [&_em]:italic [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-sm [&_code]:font-mono"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                            />
                          )
                        )}

                        {/* Display attached images */}
                        {(msg.attachments || msg.experimental_attachments)?.filter((attachment: any) =>
                          attachment?.contentType?.startsWith('image/')
                        ).map((attachment: any, idx: number) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`${message.id}-${idx}`}
                            src={attachment.url}
                            alt={attachment.name || `attachment-${idx}`}
                            className="mt-2 rounded-xl max-w-full h-auto shadow-sm"
                            style={{ maxHeight: '300px' }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[11px] text-muted-foreground px-1">
                      {formatTimestamp(message.createdAt ? new Date(message.createdAt) : new Date())}
                    </span>
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold">
                        {username?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex gap-3 animate-slide-in">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.2s' }} />
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.2s' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 py-3">
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
            >
              {/* Show uploaded image preview */}
              {uploadedFiles.length > 0 && (
                <div className="mb-3 p-3 bg-muted/50 rounded-xl border border-border animate-slide-in">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground truncate">{uploadedFiles[0].name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setUploadedFiles([])}
                      className="p-1 h-auto rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedFiles[0].url}
                    alt={uploadedFiles[0].name}
                    className="rounded-lg max-h-32 object-contain"
                  />
                </div>
              )}

              <div className="relative flex items-end gap-2 bg-muted/50 rounded-2xl border border-border focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200 p-1.5">
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
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0"
                  title="Upload image"
                >
                  {isUploadingImage ? (
                    <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                  ) : (
                    <ImageIcon className="h-5 w-5" />
                  )}
                </Button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about Indigenous languages..."
                  className={cn(
                    "flex-1 px-2 py-2.5 rounded-xl resize-none",
                    "bg-transparent",
                    "border-0 focus:outline-none",
                    "placeholder:text-muted-foreground/60",
                    "text-[15px] leading-relaxed"
                  )}
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '140px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0"
                  title="Voice input"
                >
                  <Mic className="h-5 w-5" />
                </Button>

                <Button
                  type="submit"
                  disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
                  className={cn(
                    "p-2.5 rounded-xl flex-shrink-0",
                    "bg-primary hover:bg-primary/90",
                    "disabled:opacity-30 disabled:cursor-not-allowed",
                    "transition-all duration-200",
                    "shadow-sm"
                  )}
                >
                  <Send className="h-4 w-4 text-primary-foreground" />
                </Button>
              </div>
            </form>

            {/* Disclaimer */}
            <p className="text-center text-[11px] text-muted-foreground/60 mt-2">
              AI may make mistakes. Verify translations with community language speakers.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
