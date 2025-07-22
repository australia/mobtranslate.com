import Link from 'next/link';
import { Github, Mail, Twitter } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@ui/components';

export default function About() {
  return (
    <SharedLayout>
      <PageHeader 
        title="About Mob Translate"
        description="A community-driven project aimed at creating translation tools for Australian Aboriginal languages. Our mission is to make language preservation and learning accessible to all through open-source technology."
      />

      <Section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Project Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Badge variant="primary" className="mt-0.5">1</Badge>
                  <span className="font-source-sans">Create an open-source ecosystem for indigenous language translation</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="primary" className="mt-0.5">2</Badge>
                  <span className="font-source-sans">Build a "Google Translate" equivalent for Australian Aboriginal languages</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="primary" className="mt-0.5">3</Badge>
                  <span className="font-source-sans">Preserve and promote indigenous languages through technology</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="primary" className="mt-0.5">4</Badge>
                  <span className="font-source-sans">Foster community collaboration in language documentation</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Badge variant="success" className="mt-0.5">✓</Badge>
                  <span className="font-source-sans">Dictionary support for multiple indigenous languages</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="success" className="mt-0.5">✓</Badge>
                  <span className="font-source-sans">Modern, accessible web interface</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="success" className="mt-0.5">✓</Badge>
                  <span className="font-source-sans">Community contribution system</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="success" className="mt-0.5">✓</Badge>
                  <span className="font-source-sans">Integration with language learning tools</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="About the Creator">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-1">
                <h3 className="text-2xl font-bold font-crimson mb-4">Thomas Davis</h3>
                <p className="text-muted-foreground leading-relaxed mb-6 font-source-sans">
                  Thomas Davis is a passionate developer and advocate for indigenous language preservation. 
                  With a background in web development and a commitment to open-source projects, 
                  Thomas created Mob Translate to help preserve and promote Aboriginal languages through technology.
                </p>
                
                <div className="flex flex-wrap gap-3">
                  <a 
                    href="mailto:thomasalwyndavis@gmail.com" 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    <Mail size={16} className="text-primary" />
                    <span className="font-source-sans">thomasalwyndavis@gmail.com</span>
                  </a>
                  <a 
                    href="https://twitter.com/ajaxdavis" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    <Twitter size={16} className="text-primary" />
                    <span className="font-source-sans">@ajaxdavis</span>
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Get Involved">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6 font-source-sans">
              We welcome contributions from developers, linguists, and community members. Visit our{' '}
              <Link 
                href="https://github.com/australia/mobtranslate.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 transition-colors underline"
              >
                GitHub repository
              </Link>
              {' '}to learn how you can help make indigenous language translation more accessible.
            </p>
            
            <Button asChild size="lg">
              <a 
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <Github size={20} />
                <span>Contribute on GitHub</span>
              </a>
            </Button>
          </CardContent>
        </Card>
      </Section>
    </SharedLayout>
  );
}