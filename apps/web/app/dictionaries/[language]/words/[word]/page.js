'use client';

import Link from 'next/link';
import getDictionary from '../../../../../../../packages/dictionaries';
import styled from 'styled-components';
import SharedLayout from '../../../../components/SharedLayout';

const WordContainer = styled.div`
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const BackLink = styled(Link)`
  display: inline-block;
  color: #3498db;
  text-decoration: none;
  margin-bottom: 2rem;
  font-family: 'Raleway', sans-serif;
  
  &:hover {
    text-decoration: underline;
  }
`;

const Word = styled.h1`
  font-size: 3rem;
  font-weight: 400;
  font-family: 'Libre Bodoni', serif;
  color: #2c3e50;
  margin-bottom: 1rem;
`;

const WordType = styled.div`
  font-size: 1.5rem;
  font-weight: 400;
  font-family: 'Raleway', sans-serif;
  color: #666;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #eee;
`;

const Section = styled.div`
  margin: 2rem 0;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 1rem;
  font-family: 'Libre Bodoni', serif;
`;

const Definitions = styled.ol`
  font-size: 1.1rem;
  font-family: 'Raleway', sans-serif;
  margin: 1rem 0;
  padding-left: 1.5rem;
`;

const Definition = styled.li`
  margin-bottom: 0.5rem;
  line-height: 1.6;
`;

const UsageExample = styled.div`
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const UsageLabel = styled.div`
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.5rem;
`;

const UsageText = styled.div`
  color: #34495e;
  line-height: 1.6;
  font-family: 'Raleway', sans-serif;
`;

export default function Page({ params }) {
  const dictionary = getDictionary(params.language);
  const word = dictionary?.words.find((w) => w.word === params.word);

  if (!dictionary || !word) {
    return (
      <SharedLayout>
        <WordContainer>
          <BackLink href={`/dictionaries/${params.language}`}>← Back to Dictionary</BackLink>
          <Word>Word not found</Word>
          <WordType>Sorry, we couldn't find that word in the dictionary.</WordType>
        </WordContainer>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <WordContainer>
        <BackLink href={`/dictionaries/${params.language}`}>← Back to Dictionary</BackLink>
        <Word>{word.word}</Word>
        <WordType>{word.type}</WordType>

        <Section>
          <SectionTitle>Definitions</SectionTitle>
          <Definitions>
            {word.definitions.map((definition, index) => (
              <Definition key={index}>{definition}</Definition>
            ))}
          </Definitions>
        </Section>

        {word.usages && word.usages.length > 0 && (
          <Section>
            <SectionTitle>Usage Examples</SectionTitle>
            {word.usages.map((usage, index) => (
              <UsageExample key={index}>
                <UsageLabel>English</UsageLabel>
                <UsageText>{usage.english}</UsageText>
                <UsageLabel style={{ marginTop: '1rem' }}>Translation</UsageLabel>
                <UsageText>{usage.translation}</UsageText>
              </UsageExample>
            ))}
          </Section>
        )}
      </WordContainer>
    </SharedLayout>
  );
}
