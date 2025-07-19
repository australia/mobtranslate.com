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
  EmptyState, 
  DictionaryEntry,
  SearchInput,
  Textarea,
  Select,
  Label,
  FormField,
  FilterTags,
  AlphabetFilter,
  Pagination
} from '@ui/components';
import { 
  Search, Globe, BookOpen, Users, ChevronRight, AlertCircle, CheckCircle, Info, XCircle,
  Home, Settings, Menu, X, ArrowLeft, ArrowRight, Download, Upload, Edit, Trash2,
  Copy, Save, FileText, Filter, Calendar, Clock, MapPin, Phone, Mail, User
} from 'lucide-react';

export default function StyleGuidePage() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTags, setActiveTags] = useState<string[]>(['noun']);

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

  return (
    <SharedLayout>
      <PageHeader 
        title="MobTranslate Style Guide"
        description="Comprehensive design system for the Aboriginal language dictionary platform"
      />
      
      <Container className="space-y-12 py-8">

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Button Variants</CardTitle>
                <CardDescription>Different button styles for various use cases</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button variant="primary">Primary Button</Button>
                  <span className="text-sm text-muted-foreground">Main actions</span>
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="secondary">Secondary Button</Button>
                  <span className="text-sm text-muted-foreground">Alternative actions</span>
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="outline">Outline Button</Button>
                  <span className="text-sm text-muted-foreground">Tertiary actions</span>
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="ghost">Ghost Button</Button>
                  <span className="text-sm text-muted-foreground">Subtle actions</span>
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="destructive">Destructive</Button>
                  <span className="text-sm text-muted-foreground">Dangerous actions</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Button Sizes & States</CardTitle>
                <CardDescription>Size variations and interactive states</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-2">Sizes</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-2">States</p>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled>Disabled</Button>
                    <Button className="animate-pulse">Loading...</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-2">With Icons</p>
                  <div className="flex flex-wrap gap-2">
                    <Button>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                    <Button variant="secondary">
                      Continue
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Alerts Section */}
        <Section title="Alerts & Notifications">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Alert Variants</CardTitle>
                <CardDescription>Different alert styles for various types of messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="success">
                  <CheckCircle className="w-4 h-4" />
                  <div className="ml-2">
                    <p className="font-semibold">Success!</p>
                    <p className="text-sm">Your changes have been saved successfully.</p>
                  </div>
                </Alert>
                <Alert variant="info">
                  <Info className="w-4 h-4" />
                  <div className="ml-2">
                    <p className="font-semibold">Information</p>
                    <p className="text-sm">This dictionary contains over 5,000 entries from various indigenous languages.</p>
                  </div>
                </Alert>
                <Alert variant="warning">
                  <AlertCircle className="w-4 h-4" />
                  <div className="ml-2">
                    <p className="font-semibold">Warning</p>
                    <p className="text-sm">Some translations may be incomplete. Please verify with native speakers.</p>
                  </div>
                </Alert>
                <Alert variant="error">
                  <XCircle className="w-4 h-4" />
                  <div className="ml-2">
                    <p className="font-semibold">Error</p>
                    <p className="text-sm">Failed to load dictionary data. Please try again later.</p>
                  </div>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alert Sizes</CardTitle>
                <CardDescription>Compact alerts for different contexts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="info" className="py-2">Compact alert with minimal padding</Alert>
                <Alert variant="success">Regular alert with standard padding</Alert>
                <Alert variant="warning" className="py-4">
                  <AlertCircle className="w-5 h-5" />
                  <div className="ml-3">
                    <p className="text-lg font-semibold">Large Alert</p>
                    <p>More prominent alert for important messages</p>
                  </div>
                </Alert>
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
                  <p className="text-sm font-medium mb-2">Colors</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="primary">Primary</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="success">Success</Badge>
                    <Badge variant="error">Error</Badge>
                    <Badge variant="outline">Outline</Badge>
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
                    onChange={setSearchValue}
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

        {/* Tables Section - Uncommented and fixed */}
        <Section title="Tables">
          <Card>
            <CardContent className="p-0">
              <Table>
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
                    <p className="text-sm font-medium mb-3">Custom Loading Message</p>
                    <LoadingState>
                      <span className="text-primary">Translating your text...</span>
                    </LoadingState>
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

        {/* Icons Section */}
        <Section title="Icons">
          <Card>
            <CardHeader>
              <CardTitle>Lucide Icons</CardTitle>
              <CardDescription>Consistent icon library used throughout the application</CardDescription>
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
                  { icon: MapPin, name: 'MapPin' },
                  { icon: Phone, name: 'Phone' },
                  { icon: Mail, name: 'Mail' },
                  { icon: User, name: 'User' },
                  { icon: CheckCircle, name: 'CheckCircle' },
                  { icon: XCircle, name: 'XCircle' },
                  { icon: AlertCircle, name: 'AlertCircle' },
                  { icon: Info, name: 'Info' }
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
              </div>
            </CardContent>
          </Card>
        </Section>

      </Container>
    </SharedLayout>
  );
}