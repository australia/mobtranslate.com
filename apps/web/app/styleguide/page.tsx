'use client';

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
  Container, 
  PageHeader, 
  Section, 
  // Table, 
  // TableHeader, 
  // TableBody, 
  // TableRow, 
  // TableHead, 
  // TableCell, 
  LoadingSpinner, 
  LoadingState, 
  EmptyState, 
  DictionaryEntry 
} from '@ui/components';

export default function StyleGuidePage() {
  const sampleWord = {
    word: 'babaji',
    type: 'trv',
    definition: 'ask, inquire',
    example: 'Ngayu nyungundu babajin, Wanju nyulu?'
  };

  return (
    <SharedLayout>
      <PageHeader 
        title="MobTranslate Style Guide"
        description="Comprehensive design system for the Aboriginal language dictionary platform"
      />
      
      <Container className="space-y-12 py-8">

        <Section title="Typography">
          <Card>
            <CardHeader>
              <CardTitle>Headings - Crimson Text (Serif)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h1 className="text-4xl font-bold">Heading 1 - Crimson Text Bold 4xl</h1>
                <h2 className="text-3xl font-bold">Heading 2 - Crimson Text Bold 3xl</h2>
                <h3 className="text-2xl font-semibold">Heading 3 - Crimson Text Semibold 2xl</h3>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Buttons">
          <Card>
            <CardHeader>
              <CardTitle>Button Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button variant="primary">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="outline">Outline Button</Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Alerts & Status">
          <Card>
            <CardHeader>
              <CardTitle>Alert Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Alert variant="success">Success: Operation completed!</Alert>
                <Alert variant="info">Info: Loading data...</Alert>
                <Alert variant="warning">Warning: Check your input.</Alert>
                <Alert variant="error">Error: Something went wrong.</Alert>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Badges & Form Elements">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Badges</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="primary">Primary</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Form Elements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input placeholder="Enter text..." />
                  <Input placeholder="Error state" error />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* <Section title="Tables">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Language</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Entries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Kuku Yalanji</TableCell>
                    <TableCell>Far North Queensland</TableCell>
                    <TableCell>2,847</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Mi'gmaq</TableCell>
                    <TableCell>Eastern Canada</TableCell>
                    <TableCell>1,523</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Anindilyakwa</TableCell>
                    <TableCell>Northern Territory</TableCell>
                    <TableCell>3,102</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section> */}

        <Section title="Loading States">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Loading Components</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <LoadingSpinner size="sm" />
                  <LoadingSpinner size="md" />
                  <LoadingSpinner size="lg" />
                  <LoadingState>Loading dictionary...</LoadingState>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Empty State</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon="📚"
                  title="No results found"
                  description="Try adjusting your search criteria."
                  action={<Button variant="primary">Browse All Words</Button>}
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Dictionary Components">
          <Card>
            <CardHeader>
              <CardTitle>Dictionary Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <DictionaryEntry word={sampleWord} />
            </CardContent>
          </Card>
        </Section>

      </Container>
    </SharedLayout>
  );
}