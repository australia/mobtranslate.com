'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import getDictionary from '../../../../../../../packages/dictionaries';
import styled from 'styled-components';

// @todo - pre-compile dictionaries to yaml

const WordContainer = styled.div`
  padding: 40px;
`;

const Word = styled.div`
  font-size: 44px;
  font-weight: 400;
  font-family: 'Libre Bodoni', serif;
  font-optical-sizing: auto;
  font-style: normal;
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

  const word = dictionary.words.find((word) => word.word === params.word);

  return (
    <WordContainer>
      <Word>{word.word}</Word>
      <WordType>{word.type}</WordType>
      <Definitions>
        {word.definitions.map((definition) => (
          <Definition>{definition}</Definition>
        ))}
      </Definitions>
      <Divider />
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
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      <br />
      definition
      <ul>
        <li>word: {word.word}</li>
        <li>type: {word.type}</li>
        <li>
          definitions:{' '}
          <ul>
            <li>
              {word.definitions.map((definition) => {
                return <span>{definition}</span>;
              })}
            </li>
          </ul>
        </li>
        <li>
          translations:{' '}
          <ul>
            <li>
              {word.translations.map((translation) => {
                return <span>{translation}</span>;
              })}
            </li>
          </ul>
        </li>
        <li>
          usages:{' '}
          <ul>
            <li>
              {word.usages?.map((usage) => {
                return (
                  <>
                    <div>english: {usage.english}</div>
                    <div>translation: {usage.translation}</div>
                  </>
                );
              })}
            </li>
          </ul>
        </li>
      </ul>
    </WordContainer>
  );
}
