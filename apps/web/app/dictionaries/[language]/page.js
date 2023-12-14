import { usePathname } from 'next/navigation';
import Link from 'next/link';
import getDictionary from '../../../../../packages/dictionaries';

// @todo - pre-compile dictionaries to yaml

export default function Page({ params }) {
  const dictionary = getDictionary(params.language);
  console.log(params);
  return (
    <main>
      {params.language}
      <br />
      {dictionary.words.map((word) => {
        return (
          <>
            <Link href={`/dictionaries/kuku_yalanji/words/${word.word}`}>
              {word.word}
            </Link>
            <br />
          </>
        );
      })}
    </main>
  );
}
