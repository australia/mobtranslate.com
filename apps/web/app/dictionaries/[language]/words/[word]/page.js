import { usePathname } from 'next/navigation';
import Link from 'next/link';
import getDictionary from '../../../../../../../packages/dictionaries';

// @todo - pre-compile dictionaries to yaml

export default function Page({ params }) {
  const dictionary = getDictionary(params.language);
  console.log(params);
  const word = dictionary.words.find((word) => word.word === params.word);
  return (
    <main>
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
    </main>
  );
}
