'use client';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

const data = [
  { name: 'Alice Johnson', role: 'Engineer', status: 'Active' },
  { name: 'Bob Smith', role: 'Designer', status: 'Active' },
  { name: 'Carol White', role: 'Manager', status: 'On Leave' },
  { name: 'Dave Brown', role: 'Engineer', status: 'Active' },
];

export default function TablePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Table</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Semantic HTML table components with consistent styling and responsive wrapper.
      </p>

      <Section title="Basic Table" description="A standard data table with header, body, and rows.">
        <ComponentPreview>
          <Table>
            <TableCaption>Team members</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ComponentPreview>
        <CodeBlock code={`<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Role</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Alice</TableCell>
      <TableCell>Engineer</TableCell>
    </TableRow>
  </TableBody>
</Table>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'Table', type: 'HTMLTableElement', default: '-', description: 'Root table wrapper with horizontal scroll.' },
          { name: 'TableHeader', type: 'HTMLTableSectionElement', default: '-', description: 'Table head section (<thead>).' },
          { name: 'TableBody', type: 'HTMLTableSectionElement', default: '-', description: 'Table body section (<tbody>).' },
          { name: 'TableRow', type: 'HTMLTableRowElement', default: '-', description: 'Table row (<tr>) with hover styles.' },
          { name: 'TableHead', type: 'HTMLTableCellElement', default: '-', description: 'Header cell (<th>) with bold text.' },
          { name: 'TableCell', type: 'HTMLTableCellElement', default: '-', description: 'Data cell (<td>).' },
          { name: 'TableCaption', type: 'HTMLTableCaptionElement', default: '-', description: 'Table caption for accessibility.' },
        ]} />
      </Section>
    </div>
  );
}
