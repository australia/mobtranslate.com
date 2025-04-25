'use client';

import Link from 'next/link';
import Head from 'next/head';
import SharedLayout from './components/SharedLayout';
import Translator from './components/Translator';

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
      
      <div className="text-center p-8 max-w-7xl mx-auto mt-4 mb-8">
        <h1 className="text-4xl mb-4 font-bold">Mob Translate</h1>
        <p className="text-xl text-foreground/80 max-w-3xl mx-auto mb-4 leading-relaxed">
          A fully open source community-driven project to make "Google Translate" 
          for as many Australian Aboriginal languages as possible. Join us in preserving 
          and promoting Indigenous languages through technology.
        </p>
      </div>

      {/* Translator Section - Now at the top */}
      <Translator />

      {/* Dictionaries Section */}
      <section className="max-w-7xl mx-auto my-8 p-8">
        <h2 className="text-3xl mb-6">Available Dictionaries</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link 
            href="/dictionaries/kuku_yalanji"
            className="p-6 no-underline text-foreground transition-colors duration-200 hover:text-primary"
          >
            <h3 className="text-xl mb-2">Kuku Yalanji</h3>
            <p className="text-muted-foreground">Explore the language of the Kuku Yalanji people</p>
          </Link>
          
          <Link 
            href="/dictionaries/migmaq"
            className="p-6 no-underline text-foreground transition-colors duration-200 hover:text-primary"
          >
            <h3 className="text-xl mb-2">Mi'gmaq</h3>
            <p className="text-muted-foreground">Discover the Mi'gmaq language and culture</p>
          </Link>
          
          <Link 
            href="/dictionaries/anindilyakwa"
            className="p-6 no-underline text-foreground transition-colors duration-200 hover:text-primary"
          >
            <h3 className="text-xl mb-2">Anindilyakwa</h3>
            <p className="text-muted-foreground">Explore the language of the Anindilyakwa people</p>
          </Link>
        </div>
      </section>
    </SharedLayout>
  );
}