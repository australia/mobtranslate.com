import { GuideDocument } from '../../../components/guide-document';
import { componentSpecificationGuide } from '../../../content/component-specifications';

export default function Page() {
  return <GuideDocument document={componentSpecificationGuide} />;
}
