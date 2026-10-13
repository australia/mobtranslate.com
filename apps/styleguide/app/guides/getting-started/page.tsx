import { GuideDocument } from '../../../components/guide-document';
import { developerGuides } from '../../../content/developer-guides';

export default function Page() {
  return <GuideDocument document={developerGuides['getting-started']} />;
}
