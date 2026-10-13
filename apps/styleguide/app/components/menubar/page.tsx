import { GuideDocument } from '../../../components/guide-document';
import { menuDocuments } from '../../../content/menus';

export default function Page() { return <GuideDocument document={menuDocuments['menubar']} />; }
