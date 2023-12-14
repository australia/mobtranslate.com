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
      {JSON.stringify(dictionary)}
    </main>
  );
}
