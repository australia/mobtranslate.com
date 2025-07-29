'use client';

import { useState } from 'react';
import SharedLayout from '../components/SharedLayout';
import { 
  Button, 
  Alert, 
  Badge, 
  Input, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter,
  Container, 
  PageHeader, 
  Section, 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell, 
  LoadingSpinner, 
  LoadingState, 
  LoadingSkeleton,
  EmptyState, 
  DictionaryEntry,
  SearchInput,
  Textarea,
  Select,
  Label,
  FormField,
  FilterTags,
  AlphabetFilter,
  Pagination,
  Breadcrumbs,
  TableFooter,
  TableCaption
} from '@ui/components';
import { 
  Search, Globe, BookOpen, Users, ChevronRight, AlertCircle, CheckCircle, Info, XCircle,
  Home, Settings, Menu, X, ArrowLeft, ArrowRight, Download, Upload, Edit, Trash2,
  Copy, Save, FileText, Filter, Calendar, Clock, MapPin, Phone, Mail, User,
  Heart, ThumbsUp, Star, Trophy, Medal, Crown, Target, Zap, TrendingUp, Brain,
  ChevronLeft, Timer, Award, Image, Send, MessageSquare, BarChart
} from 'lucide-react';

// Import custom components
import { SignInForm } from '@/components/auth/SignInForm';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { ModernNav } from '@/components/navigation/ModernNav';
import { WordCard } from '@/components/words/WordCard';
import { WordLikeButton } from '@/components/WordLikeButton';
import { StatsCard } from '@/components/stats/StatsCard';
import { 
  Skeleton, 
  CardSkeleton, 
  WordCardSkeleton, 
  TableSkeleton, 
  DashboardSkeleton 
} from '@/components/loading/Skeleton';

export default function StyleGuidePage() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTags, setActiveTags] = useState<string[]>(['noun']);
  const [showAuthForm, setShowAuthForm] = useState<'signin' | 'signup'>('signin');

  const sampleWord = {
    word: 'babaji',
    type: 'trv',
    definition: 'ask, inquire',
    example: 'Ngayu nyungundu babajin, Wanju nyulu?'
  };

  const sampleWords = [
    { word: 'ngayu', type: 'pron', definition: 'I, me' },
    { word: 'nyulu', type: 'pron', definition: 'he, she, it' },
    { word: 'wanju', type: 'inter', definition: 'where' }
  ];

  const tagOptions = [
    { value: 'noun', label: 'Noun' },
    { value: 'verb', label: 'Verb' },
    { value: 'adjective', label: 'Adjective' },
    { value: 'pronoun', label: 'Pronoun' }
  ];

  const breadcrumbItems = [
    { href: '/', label: 'Home' },
    { href: '/dictionaries', label: 'Dictionaries' },
    { href: '/styleguide', label: 'Style Guide' }
  ];

  return (
    <SharedLayout>
      <PageHeader 
        title="MobTranslate Component Style Guide"
        description="Comprehensive design system showcasing all components used in the Indigenous language dictionary platform"
      />
      
      <Container className="space-y-12 py-8">

        {/* Navigation */}
        <Section title="Navigation Components">
          <Card>
            <CardHeader>
              <CardTitle>Breadcrumbs</CardTitle>
              <CardDescription>Navigation path indicator</CardDescription>
            </CardHeader>
            <CardContent>
              <Breadcrumbs items={breadcrumbItems} />
            </CardContent>
          </Card>
        </Section>

        {/* Color Palette Section */}
        <Section title="Color Palette">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Primary Colors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-primary rounded-lg shadow-sm" />
                  <div>
                    <p className="font-semibold">Primary</p>
                    <p className="text-sm text-muted-foreground">Action buttons, links</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-primary-foreground rounded-lg shadow-sm border" />
                  <div>
                    <p className="font-semibold">Primary Foreground</p>
                    <p className="text-sm text-muted-foreground">Text on primary bg</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Secondary Colors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-secondary rounded-lg shadow-sm" />
                  <div>
                    <p className="font-semibold">Secondary</p>
                    <p className="text-sm text-muted-foreground">Secondary actions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-muted rounded-lg shadow-sm" />
                  <div>
                    <p className="font-semibold">Muted</p>
                    <p className="text-sm text-muted-foreground">Disabled states</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Semantic Colors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-green-500 rounded-lg shadow-sm" />
                  <div>
                    <p className="font-semibold">Success</p>
                    <p className="text-sm text-muted-foreground">Positive feedback</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-red-500 rounded-lg shadow-sm" />
                  <div>
                    <p className="font-semibold">Error</p>
                    <p className="text-sm text-muted-foreground">Error states</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Typography Section */}
        <Section title="Typography">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Headings - Crimson Text (Serif)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h1 className="text-5xl font-bold text-foreground">Display Heading</h1>
                  <p className="text-sm text-muted-foreground mt-1">text-5xl font-bold</p>
                </div>
                <div>
                  <h1 className="text-4xl font-bold">Heading 1</h1>
                  <p className="text-sm text-muted-foreground mt-1">text-4xl font-bold</p>
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Heading 2</h2>
                  <p className="text-sm text-muted-foreground mt-1">text-3xl font-bold</p>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold">Heading 3</h3>
                  <p className="text-sm text-muted-foreground mt-1">text-2xl font-semibold</p>
                </div>
                <div>
                  <h4 className="text-xl font-semibold">Heading 4</h4>
                  <p className="text-sm text-muted-foreground mt-1">text-xl font-semibold</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Body Text - Source Sans Pro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-lg leading-relaxed">Large body text for emphasis or introductions. Perfect for making important content stand out.</p>
                  <p className="text-sm text-muted-foreground mt-1">text-lg leading-relaxed</p>
                </div>
                <div>
                  <p className="text-base">Regular body text for general content. This is the default size for most paragraph text.</p>
                  <p className="text-sm text-muted-foreground mt-1">text-base</p>
                </div>
                <div>
                  <p className="text-sm">Small text for secondary information or metadata.</p>
                  <p className="text-sm text-muted-foreground mt-1">text-sm</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Extra small text for labels or timestamps.</p>
                  <p className="text-sm text-muted-foreground mt-1">text-xs text-muted-foreground</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Buttons Section */}
        <Section title="Buttons">
          <div className="space-y-6">
            {/* Button Variants */}
            <Card>
              <CardHeader>
                <CardTitle>Button Variants</CardTitle>
                <CardDescription>Different button styles for various use cases</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Button variant="primary" fullWidth>Primary</Button>
                    <p className="text-xs text-muted-foreground">Main actions</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="secondary" fullWidth>Secondary</Button>
                    <p className="text-xs text-muted-foreground">Alternative actions</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="destructive" fullWidth>Destructive</Button>
                    <p className="text-xs text-muted-foreground">Dangerous actions</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" fullWidth>Outline</Button>
                    <p className="text-xs text-muted-foreground">Bordered style</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="ghost" fullWidth>Ghost</Button>
                    <p className="text-xs text-muted-foreground">Minimal style</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="link" fullWidth>Link</Button>
                    <p className="text-xs text-muted-foreground">Text link style</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="success" fullWidth>Success</Button>
                    <p className="text-xs text-muted-foreground">Positive actions</p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="warning" fullWidth>Warning</Button>
                    <p className="text-xs text-muted-foreground">Caution actions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Button Sizes */}
            <Card>
              <CardHeader>
                <CardTitle>Button Sizes</CardTitle>
                <CardDescription>Size variations for different contexts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="xs">Extra Small</Button>
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="xl">Extra Large</Button>
                </div>
                <div className="mt-6 space-y-3">
                  <p className="text-sm font-medium">Full Width Buttons</p>
                  <Button fullWidth size="sm">Small Full Width</Button>
                  <Button fullWidth>Medium Full Width</Button>
                  <Button fullWidth size="lg">Large Full Width</Button>
                </div>
              </CardContent>
            </Card>

            {/* Button States */}
            <Card>
              <CardHeader>
                <CardTitle>Button States</CardTitle>
                <CardDescription>Interactive states and behaviors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-sm font-medium mb-3">Hover States (hover over buttons)</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary">Primary Hover</Button>
                    <Button variant="secondary">Secondary Hover</Button>
                    <Button variant="destructive">Destructive Hover</Button>
                    <Button variant="outline">Outline Hover</Button>
                    <Button variant="ghost">Ghost Hover</Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-3">Disabled States</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary" disabled>Primary</Button>
                    <Button variant="secondary" disabled>Secondary</Button>
                    <Button variant="destructive" disabled>Destructive</Button>
                    <Button variant="outline" disabled>Outline</Button>
                    <Button variant="ghost" disabled>Ghost</Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-3">Loading States</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary" loading>Loading</Button>
                    <Button variant="secondary" loading loadingText="Processing...">Processing</Button>
                    <Button variant="outline" loading loadingText="Please wait">Please wait</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Button with Icons */}
            <Card>
              <CardHeader>
                <CardTitle>Buttons with Icons</CardTitle>
                <CardDescription>Icon placement and combinations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Button leftIcon={<Download className="h-4 w-4" />}>Download</Button>
                  <Button rightIcon={<ArrowRight className="h-4 w-4" />}>Next</Button>
                  <Button leftIcon={<ArrowLeft className="h-4 w-4" />} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Navigate
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="success" leftIcon={<CheckCircle className="h-4 w-4" />}>Save</Button>
                  <Button variant="destructive" leftIcon={<Trash2 className="h-4 w-4" />}>Delete</Button>
                  <Button variant="outline" leftIcon={<Edit className="h-4 w-4" />}>Edit</Button>
                </div>
                <div>
                  <p className="text-sm font-medium mb-3">Icon-only Buttons</p>
                  <div className="flex flex-wrap gap-3">
                    <Button size="xs" variant="ghost" className="p-1"><X className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="p-2"><Menu className="h-4 w-4" /></Button>
                    <Button variant="outline" className="p-2.5"><Settings className="h-5 w-5" /></Button>
                    <Button variant="primary" className="p-3"><Save className="h-5 w-5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Alerts Section */}
        <Section title="Alerts & Notifications">
          <div className="space-y-6">
            {/* Basic Alert Variants */}
            <Card>
              <CardHeader>
                <CardTitle>Alert Variants</CardTitle>
                <CardDescription>Different alert styles for various types of messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert 
                  variant="default"
                  title="Default Alert"
                  description="This is a default alert with neutral styling for general messages."
                  icon={<Info className="h-5 w-5" />}
                />
                <Alert 
                  variant="success"
                  title="Success!"
                  description="Your changes have been saved successfully."
                  icon={<CheckCircle className="h-5 w-5" />}
                />
                <Alert 
                  variant="info"
                  title="Information"
                  description="This dictionary contains over 5,000 entries from various Indigenous languages."
                  icon={<Info className="h-5 w-5" />}
                />
                <Alert 
                  variant="warning"
                  title="Warning"
                  description="Some translations may be incomplete. Please verify with native speakers."
                  icon={<AlertCircle className="h-5 w-5" />}
                />
                <Alert 
                  variant="error"
                  title="Error"
                  description="Failed to load dictionary data. Please try again later."
                  icon={<XCircle className="h-5 w-5" />}
                />
                <Alert 
                  variant="destructive"
                  title="Destructive Action"
                  description="This action cannot be undone. Please proceed with caution."
                  icon={<AlertCircle className="h-5 w-5" />}
                />
              </CardContent>
            </Card>

            {/* Alert Features */}
            <Card>
              <CardHeader>
                <CardTitle>Alert Features</CardTitle>
                <CardDescription>Additional alert functionality and layouts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Dismissible Alert */}
                <Alert 
                  variant="info"
                  title="Dismissible Alert"
                  description="This alert can be dismissed by clicking the X button."
                  icon={<Info className="h-5 w-5" />}
                  dismissible
                  onDismiss={() => console.log('Alert dismissed')}
                />
                
                {/* Alert with Action */}
                <Alert 
                  variant="warning"
                  title="Action Required"
                  description="Your session will expire in 5 minutes."
                  icon={<Clock className="h-5 w-5" />}
                  action={
                    <Button size="sm" variant="outline">
                      Extend Session
                    </Button>
                  }
                />
                
                {/* Alert without Icon */}
                <Alert 
                  variant="success"
                  title="No Icon Alert"
                  description="This alert doesn't have an icon for a cleaner look."
                />
                
                {/* Simple Alert (Legacy) */}
                <Alert variant="info">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Legacy alert style with custom content layout</span>
                  </div>
                </Alert>
                
                {/* Complex Alert with Multiple Actions */}
                <Alert 
                  variant="error"
                  title="Connection Lost"
                  description="Unable to connect to the server. Please check your internet connection."
                  icon={<AlertCircle className="h-5 w-5" />}
                  dismissible
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">Retry</Button>
                      <Button size="sm" variant="ghost">Learn More</Button>
                    </div>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Badges Section */}
        <Section title="Badges & Tags">
          <Card>
            <CardHeader>
              <CardTitle>Badge Variants</CardTitle>
              <CardDescription>Labels and tags for categorization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Variants</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge>Default</Badge>
                    <Badge variant="primary">Primary</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="success">Success</Badge>
                    <Badge variant="error">Error</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Shapes</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge shape="rounded">Rounded</Badge>
                    <Badge shape="pill">Pill Shape</Badge>
                    <Badge variant="success" shape="pill">Success Pill</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Usage Examples</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="primary">noun</Badge>
                    <Badge variant="secondary">verb</Badge>
                    <Badge variant="outline">adjective</Badge>
                    <Badge variant="success">verified</Badge>
                    <Badge variant="error">deprecated</Badge>
                    <Badge>1117 words</Badge>
                    <Badge variant="destructive">very-low volume</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Form Elements Section */}
        <Section title="Form Elements">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Input Fields</CardTitle>
                <CardDescription>Text input variations and states</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Default Input">
                  <Input 
                    placeholder="Enter text..." 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </FormField>
                
                <FormField label="With Helper Text" helperText="This field is required">
                  <Input placeholder="Required field" required />
                </FormField>
                
                <FormField label="Error State" error="Please enter a valid value">
                  <Input placeholder="Error state" error />
                </FormField>
                
                <FormField label="Disabled State">
                  <Input placeholder="Disabled input" disabled />
                </FormField>

                <FormField label="Search Input">
                  <SearchInput 
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search dictionary..."
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select & Textarea</CardTitle>
                <CardDescription>Dropdown and multiline text inputs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Select Dropdown">
                  <Select 
                    value={selectValue}
                    onChange={(e) => setSelectValue(e.target.value)}
                  >
                    <option value="">Choose an option</option>
                    <option value="kuku-yalanji">Kuku Yalanji</option>
                    <option value="migmaq">Mi'gmaq</option>
                    <option value="anindilyakwa">Anindilyakwa</option>
                  </Select>
                </FormField>

                <FormField label="Textarea">
                  <Textarea 
                    placeholder="Enter multiple lines of text..."
                    value={textareaValue}
                    onChange={(e) => setTextareaValue(e.target.value)}
                    rows={4}
                  />
                </FormField>

                <FormField label="Character Count" helperText={`${textareaValue.length}/200 characters`}>
                  <Textarea 
                    placeholder="Limited to 200 characters..."
                    value={textareaValue}
                    onChange={(e) => setTextareaValue(e.target.value.slice(0, 200))}
                    rows={3}
                  />
                </FormField>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Interactive Components */}
        <Section title="Interactive Components">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Filter Components</CardTitle>
                <CardDescription>Interactive filtering and selection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2">Alphabet Filter</Label>
                  <AlphabetFilter 
                    selectedLetter={selectedLetter}
                    onLetterSelect={setSelectedLetter}
                  />
                </div>
                
                <div>
                  <Label className="mb-2">Filter Tags</Label>
                  <FilterTags 
                    tags={tagOptions}
                    activeTags={activeTags}
                    onTagToggle={(tag) => {
                      setActiveTags(prev => 
                        prev.includes(tag) 
                          ? prev.filter(t => t !== tag)
                          : [...prev, tag]
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pagination</CardTitle>
                <CardDescription>Navigate through large datasets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Pagination 
                  currentPage={currentPage}
                  totalPages={10}
                  onPageChange={setCurrentPage}
                />
                
                <div className="text-sm text-muted-foreground text-center">
                  Showing page {currentPage} of 10
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Cards Section */}
        <Section title="Cards & Containers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Card</CardTitle>
                <CardDescription>Standard card with header and content</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Cards are used to group related content and provide visual hierarchy. They can contain any type of content.</p>
              </CardContent>
              <CardFooter>
                <Button variant="primary" size="sm">Action</Button>
                <Button variant="outline" size="sm" className="ml-2">Cancel</Button>
              </CardFooter>
            </Card>

            <Card hover>
              <CardHeader>
                <CardTitle>Hoverable Card</CardTitle>
                <CardDescription>Interactive card with hover effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This card has a hover effect that lifts it slightly and adds a shadow. Perfect for clickable items.</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Word Components */}
        <Section title="Word Components">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">WordCard</h3>
              <div className="grid gap-4 max-w-3xl">
                <WordCard
                  wordId="1"
                  word="Nginda"
                  translation="You"
                  languageName="Kuku Yalanji"
                  languageCode="aus-kky"
                  stats={{
                    bucket: 0
                  }}
                  clickable={false}
                  onLike={async () => {}}
                  initialLiked={false}
                />
                <WordCard
                  wordId="2"
                  word="Yirrbal"
                  translation="Language, words, speaking"
                  languageName="Yidiny"
                  languageCode="aus-ydd"
                  showStats={true}
                  stats={{
                    attempts: 15,
                    accuracy: 85,
                    avgResponseTime: 1200,
                    lastSeen: new Date().toISOString(),
                    bucket: 3
                  }}
                  clickable={false}
                  onLike={async () => {}}
                />
                <WordCard
                  wordId="3"
                  word="Nganyja"
                  translation="To see, look, watch"
                  languageName="Warlpiri"
                  languageCode="aus-wbp"
                  compact={true}
                  stats={{
                    bucket: 5
                  }}
                  clickable={false}
                  onLike={async () => {}}
                  initialLiked={true}
                />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">WordLikeButton</h3>
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-gray-600 mb-3">Sizes:</p>
                  <div className="flex gap-4 items-center">
                    <WordLikeButton wordId="1" size="sm" />
                    <WordLikeButton wordId="2" size="default" />
                    <WordLikeButton wordId="3" size="lg" />
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-3">Variants:</p>
                  <div className="flex gap-4 items-center">
                    <WordLikeButton wordId="4" variant="default" />
                    <WordLikeButton wordId="5" variant="minimal" />
                    <WordLikeButton wordId="6" variant="floating" />
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-3">With Labels:</p>
                  <div className="flex gap-4 items-center">
                    <WordLikeButton wordId="7" showLabel={true} size="sm" />
                    <WordLikeButton wordId="8" showLabel={true} />
                    <WordLikeButton wordId="9" showLabel={true} size="lg" variant="floating" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Statistics Components */}
        <Section title="Statistics Components">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard
                title="Total Questions"
                value="1,234"
                icon={Brain}
                iconColor="text-blue-500"
                description="Questions answered this month"
              />
              
              <StatsCard
                title="Accuracy Rate"
                value="87.5%"
                icon={Target}
                iconColor="text-green-500"
                progress={{
                  value: 87.5,
                  max: 100
                }}
              />
              
              <StatsCard
                title="Study Streak"
                value="14 days"
                icon={Zap}
                iconColor="text-orange-500"
                trend={{
                  value: 23,
                  isPositive: true
                }}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard
                title="Words Learned"
                value="256"
                icon={BookOpen}
                iconColor="text-purple-500"
                trend={{
                  value: -5,
                  isPositive: false
                }}
                description="12 new words this week"
              />
              
              <StatsCard
                title="Time Spent"
                value="3h 24m"
                icon={Clock}
                iconColor="text-indigo-500"
                description="Average per session: 12m"
              />
              
              <StatsCard
                title="Achievement Progress"
                value="Level 5"
                icon={Trophy}
                iconColor="text-yellow-500"
                progress={{
                  value: 320,
                  max: 500
                }}
                description="180 XP to next level"
              />
            </div>
          </div>
        </Section>

        {/* Tables Section */}
        <Section title="Tables">
          <Card>
            <CardHeader>
              <CardTitle>Data Table</CardTitle>
              <CardDescription>Table with caption and footer</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableCaption>A list of Indigenous language words</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Word</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Definition</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleWords.map((word, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{word.word}</TableCell>
                      <TableCell>
                        <Badge variant="outline" shape="pill">{word.type}</Badge>
                      </TableCell>
                      <TableCell>{word.definition}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">3 words</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </Section>

        {/* Loading States */}
        <Section title="Loading & Empty States">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Loading Components</CardTitle>
                <CardDescription>Various loading indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium mb-3">Spinner Sizes</p>
                    <div className="flex items-center gap-4">
                      <LoadingSpinner size="sm" />
                      <LoadingSpinner size="md" />
                      <LoadingSpinner size="lg" />
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-3">Loading State</p>
                    <LoadingState>Loading dictionary entries...</LoadingState>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-3">Loading Skeleton</p>
                    <LoadingSkeleton className="h-20 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Empty States</CardTitle>
                <CardDescription>When there's no data to display</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <EmptyState
                  icon="🔍"
                  title="No results found"
                  description="Try adjusting your search criteria or browse all entries."
                  action={<Button variant="primary" size="sm">Browse All</Button>}
                />
                
                <EmptyState
                  icon="📚"
                  title="Dictionary is empty"
                  description="Start adding words to build your dictionary."
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Skeleton Loaders */}
        <Section title="Skeleton Loaders">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Skeletons</CardTitle>
                <CardDescription>Loading placeholders for different content types</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Base Skeleton</p>
                  <Skeleton className="h-12 w-full" />
                </div>
                
                <div>
                  <p className="text-sm font-medium mb-2">Card Skeleton</p>
                  <CardSkeleton />
                </div>
                
                <div>
                  <p className="text-sm font-medium mb-2">Word Card Skeleton</p>
                  <WordCardSkeleton />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Complex Skeletons</CardTitle>
                <CardDescription>Full layout loading states</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Table Skeleton</p>
                  <div className="h-48 overflow-hidden">
                    <TableSkeleton />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Dictionary Components */}
        <Section title="Dictionary Components">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Dictionary Entry</CardTitle>
                <CardDescription>Individual word display</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DictionaryEntry word={sampleWord} />
                <DictionaryEntry word={{
                  word: 'waybul',
                  type: 'n',
                  definition: 'white person, European',
                  example: 'Waybul jana-ny kari nganyi.',
                  alternates: ['waibul', 'waybel']
                }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dictionary List</CardTitle>
                <CardDescription>Multiple entries in a list format</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sampleWords.map((word, index) => (
                    <div key={index} className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">{word.word}</span>
                          <Badge variant="outline" shape="pill" className="ml-2">{word.type}</Badge>
                        </div>
                        <Button variant="ghost" size="sm">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{word.definition}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Authentication Forms */}
        <Section title="Authentication Components">
          <Card>
            <CardHeader>
              <CardTitle>Auth Forms</CardTitle>
              <CardDescription>Sign in and sign up forms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="flex gap-2">
                  <Button 
                    variant={showAuthForm === 'signin' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setShowAuthForm('signin')}
                  >
                    Sign In Form
                  </Button>
                  <Button 
                    variant={showAuthForm === 'signup' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setShowAuthForm('signup')}
                  >
                    Sign Up Form
                  </Button>
                </div>
              </div>
              
              <div className="max-w-md mx-auto">
                {showAuthForm === 'signin' ? (
                  <SignInForm />
                ) : (
                  <SignUpForm />
                )}
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Icons Section */}
        <Section title="Icons">
          <Card>
            <CardHeader>
              <CardTitle>Lucide Icons</CardTitle>
              <CardDescription>Comprehensive icon library used throughout the application</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { icon: Home, name: 'Home' },
                  { icon: Search, name: 'Search' },
                  { icon: Globe, name: 'Globe' },
                  { icon: BookOpen, name: 'BookOpen' },
                  { icon: Users, name: 'Users' },
                  { icon: Settings, name: 'Settings' },
                  { icon: Menu, name: 'Menu' },
                  { icon: X, name: 'Close' },
                  { icon: ChevronRight, name: 'ChevronRight' },
                  { icon: ChevronLeft, name: 'ChevronLeft' },
                  { icon: ArrowLeft, name: 'ArrowLeft' },
                  { icon: ArrowRight, name: 'ArrowRight' },
                  { icon: Download, name: 'Download' },
                  { icon: Upload, name: 'Upload' },
                  { icon: Edit, name: 'Edit' },
                  { icon: Trash2, name: 'Trash' },
                  { icon: Copy, name: 'Copy' },
                  { icon: Save, name: 'Save' },
                  { icon: FileText, name: 'FileText' },
                  { icon: Filter, name: 'Filter' },
                  { icon: Calendar, name: 'Calendar' },
                  { icon: Clock, name: 'Clock' },
                  { icon: Timer, name: 'Timer' },
                  { icon: MapPin, name: 'MapPin' },
                  { icon: Phone, name: 'Phone' },
                  { icon: Mail, name: 'Mail' },
                  { icon: User, name: 'User' },
                  { icon: CheckCircle, name: 'CheckCircle' },
                  { icon: XCircle, name: 'XCircle' },
                  { icon: AlertCircle, name: 'AlertCircle' },
                  { icon: Info, name: 'Info' },
                  { icon: Heart, name: 'Heart' },
                  { icon: ThumbsUp, name: 'ThumbsUp' },
                  { icon: Star, name: 'Star' },
                  { icon: Trophy, name: 'Trophy' },
                  { icon: Medal, name: 'Medal' },
                  { icon: Crown, name: 'Crown' },
                  { icon: Target, name: 'Target' },
                  { icon: Zap, name: 'Zap' },
                  { icon: TrendingUp, name: 'TrendingUp' },
                  { icon: Brain, name: 'Brain' },
                  { icon: Award, name: 'Award' },
                  { icon: Image, name: 'Image' },
                  { icon: Send, name: 'Send' },
                  { icon: MessageSquare, name: 'MessageSquare' },
                  { icon: BarChart, name: 'BarChart' }
                ].map(({ icon: Icon, name }) => (
                  <div key={name} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <Icon className="w-6 h-6 text-foreground" />
                    <span className="text-xs text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Spacing & Layout */}
        <Section title="Spacing & Layout">
          <Card>
            <CardHeader>
              <CardTitle>Spacing Scale</CardTitle>
              <CardDescription>Consistent spacing system based on Tailwind defaults</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-1</div>
                  <div className="flex-1 h-4 bg-primary/20 rounded" style={{width: '0.25rem'}} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-2</div>
                  <div className="h-4 bg-primary/20 rounded" style={{width: '0.5rem'}} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-4</div>
                  <div className="h-4 bg-primary/20 rounded" style={{width: '1rem'}} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-6</div>
                  <div className="h-4 bg-primary/20 rounded" style={{width: '1.5rem'}} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-8</div>
                  <div className="h-4 bg-primary/20 rounded" style={{width: '2rem'}} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">space-12</div>
                  <div className="h-4 bg-primary/20 rounded" style={{width: '3rem'}} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Usage Guidelines */}
        <Section title="Component Usage Guidelines">
          <Card>
            <CardHeader>
              <CardTitle>Best Practices</CardTitle>
              <CardDescription>Guidelines for using components effectively</CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <h3>Component Selection</h3>
              <ul>
                <li><strong>Buttons:</strong> Use primary for main actions, secondary for alternatives, outline for tertiary actions</li>
                <li><strong>Alerts:</strong> Success for confirmations, info for neutral messages, warning for cautions, error for failures</li>
                <li><strong>Badges:</strong> Use for categorization, status indicators, or counts</li>
                <li><strong>Cards:</strong> Group related content, use hover effect for clickable items</li>
                <li><strong>Loading States:</strong> Always show loading feedback for async operations</li>
              </ul>

              <h3>Accessibility</h3>
              <ul>
                <li>All interactive elements must be keyboard accessible</li>
                <li>Use semantic HTML and ARIA labels where appropriate</li>
                <li>Maintain sufficient color contrast ratios</li>
                <li>Provide alternative text for icons and images</li>
              </ul>

              <h3>Consistency</h3>
              <ul>
                <li>Use the established color palette and typography scale</li>
                <li>Maintain consistent spacing using the spacing scale</li>
                <li>Follow the established patterns for similar functionality</li>
                <li>Use the same icons for the same actions throughout the app</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

      </Container>
    </SharedLayout>
  );
}