'use client';

import Link from 'next/link';
import styled from 'styled-components';
import Head from 'next/head';
import SharedLayout from './components/SharedLayout';

const HeroSection = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  max-width: 1200px;
  margin: 2rem auto;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const Title = styled.h1`
  font-size: 3rem;
  color: #2c3e50;
  margin-bottom: 1rem;
  font-weight: bold;
`;

const Byline = styled.p`
  font-size: 1.25rem;
  color: #34495e;
  max-width: 800px;
  margin: 0 auto 2rem;
  line-height: 1.6;
`;

const DictionariesSection = styled.section`
  max-width: 1200px;
  margin: 2rem auto;
  padding: 2rem;
  background: white;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const SubTitle = styled.h2`
  font-size: 2rem;
  color: #2c3e50;
  margin-bottom: 1.5rem;
`;

const DictionaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
`;

const DictionaryCard = styled(Link)`
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  color: #2c3e50;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 6px 12px rgba(0,0,0,0.1);
  }
  
  h3 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }
`;

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
      <HeroSection>
        <Title>Mob Translate</Title>
        <Byline>
          A fully open source community orientated endeavour to make "Google Translate" 
          for as many Australian Aboriginal languages as possible. Join us in preserving 
          and promoting Indigenous languages through technology.
        </Byline>
      </HeroSection>

      <DictionariesSection>
        <SubTitle>Available Dictionaries</SubTitle>
        <DictionaryGrid>
          <DictionaryCard href="/dictionaries/kuku_yalanji">
            <h3>Kuku Yalanji</h3>
            <p>Explore the language of the Kuku Yalanji people</p>
          </DictionaryCard>
          <DictionaryCard href="/dictionaries/migmaq">
            <h3>Mi'gmaq</h3>
            <p>Discover the Mi'gmaq language and culture</p>
          </DictionaryCard>
        </DictionaryGrid>
      </DictionariesSection>
    </SharedLayout>
  );
}
0