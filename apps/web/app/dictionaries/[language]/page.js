'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import getDictionary from '../../../../../packages/dictionaries';
import styled from 'styled-components';

const WordContainer = styled.div`
  padding: 40px;
`;

const Dictionary = styled.div`
  padding: 40px;
`;

const Word = styled.div`
  font-size: 44px;
  font-weight: 400;
  font-family: 'Libre Bodoni', serif;
  font-optical-sizing: auto;
  font-style: normal;
  text-decoration: none;
  & a {
    text-decoration: none;
  }
  & a:hover {
    text-decoration: underline;
  }

  & a:visited {
    color: #000;
  }
  & a:link {
    color: #000;
  }
`;

const WordType = styled.div`
  font-size: 24px;
  font-weight: 400;
  font-family: 'Raleway', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
`;

const Definitions = styled.ol`
  font-size: 18px;
  font-family: 'Raleway', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
  margin: 20 0;
`;

const Definition = styled.li`
  font-size: 18px;
`;

const Usages = styled.ol`
  font-size: 18px;
  font-family: 'Raleway', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
  margin: 20 0;
`;

const Usage = styled.li`
  font-size: 18px;
  line-height: 26px;
`;

const UsageLabel = styled.span`
  font-weight: 400;
  color: #000;
  width: 120px;
  display: inline-block;
`;

const Divider = styled.div`
  border-bottom: 2px solid #333;
  width: 500px;
`;

export default function Page({ params }) {
  const dictionary = getDictionary(params.language);
  console.log(params);
  return (
    <Dictionary>
      {dictionary.words.map((word) => {
        return (
          <>
            <Word>
              <Link
                href={`/dictionaries/${params.language}/words/${word.word}`}
              >
                {word.word}
              </Link>
            </Word>
            <WordType>{word.type}</WordType>
            {word.defintions ?? (
              <Definitions>
                {word?.definitions?.map((definition) => (
                  <Definition>{definition}</Definition>
                ))}
              </Definitions>
            )}
            {word.usages?.length === 0 ?? <Divider />}
            <Usages>
              {word.usages?.map((usage) => {
                return (
                  <Usage>
                    <div>
                      <UsageLabel>english:</UsageLabel> {usage.english}
                    </div>
                    <div>
                      <UsageLabel>translation:</UsageLabel> {usage.translation}
                    </div>
                  </Usage>
                );
              })}
            </Usages>
            <br />
          </>
        );
      })}
    </Dictionary>
  );
}
