import React from 'react';

interface Prop {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export function PropsTable({ props }: { props: Prop[] }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--color-border)]">
            <th className="text-left py-2 px-3 font-semibold">Prop</th>
            <th className="text-left py-2 px-3 font-semibold">Type</th>
            <th className="text-left py-2 px-3 font-semibold">Default</th>
            <th className="text-left py-2 px-3 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-b border-[var(--color-border)]">
              <td className="py-2 px-3 font-mono text-[var(--color-primary)]">{prop.name}</td>
              <td className="py-2 px-3 font-mono text-xs">{prop.type}</td>
              <td className="py-2 px-3 font-mono text-xs">{prop.default || '-'}</td>
              <td className="py-2 px-3">{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
