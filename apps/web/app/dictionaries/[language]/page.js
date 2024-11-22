'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import getDictionary from '../../../../../packages/dictionaries';
import styled from 'styled-components';
import SharedLayout from '../../components/SharedLayout';

const DictionaryContainer = styled.div`
  max-width: 1200px;
  margin: 2rem auto;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const WordList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
`;

const WordCard = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const Word = styled.div`
  font-size: 2rem;
  font-weight: 400;
  font-family: 'Libre Bodoni', serif;
  margin-bottom: 1rem;
  
  a {
    text-decoration: none;
    color: #2c3e50;
    transition: color 0.3s ease;
    
    &:hover {
      color: #3498db;
      text-decoration: underline;
    }
  }
`;

const WordType = styled.div`
  font-size: 1.2rem;
  font-weight: 400;
  font-family: 'Raleway', sans-serif;
  color: #666;
  margin-bottom: 1rem;
`;

const Definitions = styled.ol`
  font-size: 1rem;
  font-family: 'Raleway', sans-serif;
  margin: 1rem 0;
  padding-left: 1.5rem;
`;

const Definition = styled.li`
  margin-bottom: 0.5rem;
  line-height: 1.6;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 2rem;
  font-family: 'Libre Bodoni', serif;
  text-align: center;
`;

export default function Page({ params }) {
  const dictionary = getDictionary(params.language);
  
  if (!dictionary) {
    return (
      <SharedLayout>
        <DictionaryContainer>
          <Title>Dictionary not found</Title>
          <p>Sorry, we couldn't find that dictionary.</p>
          <Link href="/dictionaries">Back to Dictionaries</Link>
        </DictionaryContainer>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <DictionaryContainer>
        <Title>{dictionary.name} Dictionary</Title>
        <WordList>
          {dictionary.words.map((word) => (
            <WordCard key={word.word}>
              <Word>
                <Link href={`/dictionaries/${params.language}/words/${word.word}`}>
                  {word.word}
                </Link>
              </Word>
              <WordType>{word.type}</WordType>
              <Definitions>
                {word.definitions?.map((definition, index) => (
                  <Definition key={index}>{definition}</Definition>
                ))}
              </Definitions>
            </WordCard>
          ))}
        </WordList>
      </DictionaryContainer>
    </SharedLayout>
  );
}
