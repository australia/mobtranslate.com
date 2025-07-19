'use client';

import Link from 'next/link';
import Head from 'next/head';
import SharedLayout from './components/SharedLayout';
import Translator from './components/Translator';
import { PageHeader, Section, Card, CardContent, Container } from '@ui/components';

export default function Page() {
  return (
    <SharedLayout>
      <Head>
        <title>Mob Translate - Aboriginal Language Translation</title>
        <meta
          name="description"
          content="A community-driven project to create translation tools for Australian Aboriginal languages, making language preservation and learning accessible to all."
          key="desc"
        />
        <script src="https://drainpipe.io/agent/client/673dc10b1adbeb2249ef0536" />
      </Head>
      
      <PageHeader 
        title="Mob Translate"
        description="A fully open source community-driven project to make 'Google Translate' for as many Australian Aboriginal languages as possible. Join us in preserving and promoting Indigenous languages through technology."
      />

      <Section contained={false}>
        <Container>
          <Translator />
        </Container>
      </Section>

      <Section 
        title="Available Dictionaries"
        description="Explore our growing collection of Aboriginal language dictionaries"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/dictionaries/kuku_yalanji" className="block no-underline">
            <Card hover className="h-full">
              <CardContent className="p-6">
                <h3 className="text-xl mb-2 font-crimson">Kuku Yalanji</h3>
                <p className="text-muted-foreground font-source-sans">
                  Explore the language of the Kuku Yalanji people
                </p>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/dictionaries/migmaq" className="block no-underline">
            <Card hover className="h-full">
              <CardContent className="p-6">
                <h3 className="text-xl mb-2 font-crimson">Mi'gmaq</h3>
                <p className="text-muted-foreground font-source-sans">
                  Discover the Mi'gmaq language and culture
                </p>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/dictionaries/anindilyakwa" className="block no-underline">
            <Card hover className="h-full">
              <CardContent className="p-6">
                <h3 className="text-xl mb-2 font-crimson">Anindilyakwa</h3>
                <p className="text-muted-foreground font-source-sans">
                  Explore the language of the Anindilyakwa people
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </Section>
    </SharedLayout>
  );
}