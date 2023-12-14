import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Page() {
  return (
    <main>
      dictionaries
      <br />
      <Link href="/dictionaries/kuku_yalanji">Kuku Yalanji</Link>
    </main>
  );
}
