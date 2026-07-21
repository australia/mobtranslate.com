import { createHash } from 'node:crypto';

export type DatasetSplit = 'train' | 'validation' | 'test';

export type LeakageNode = {
  entryId: string;
  headword: string;
  sourceTexts: string[];
  targetTexts: string[];
};

export type LeakageAuditRow = {
  id: string;
  split: DatasetSplit;
  leakageGroup: string;
  entryIds: string[];
  headwords: string[];
  sourceText: string;
  targetText: string;
};

export type LeakageViolation = {
  dimension: 'leakage_group' | 'entry' | 'headword' | 'source_text' | 'target_text' | 'bilingual_pair';
  keyDigest: string;
  splits: DatasetSplit[];
  rowIds: string[];
};

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(value: string): void {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value);
    if (parent === undefined) throw new Error(`Unknown union-find value: ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [parent, child] = [leftRoot, rightRoot].sort();
    this.parent.set(child, parent);
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const windows1252Decoder = new TextDecoder('windows-1252');

/** Repair C1 bytes that were decoded as controls instead of Windows-1252 punctuation. */
export function repairWindows1252Controls(value: string): string {
  return value.replace(/[\u0080-\u009f]/gu, (character) =>
    windows1252Decoder.decode(Uint8Array.of(character.charCodeAt(0))));
}

/** Preserve linguistic content while removing transport-only variation. */
export function canonicalDatasetText(value: string): string {
  return repairWindows1252Controls(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** Comparison form used only for leakage detection; never emitted as model text. */
export function leakageComparisonText(value: string): string {
  return canonicalDatasetText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Quotation_Mark}/gu, "'");
}

export function bilingualComparisonKey(sourceText: string, targetText: string): string {
  return `${leakageComparisonText(sourceText)}\u001f${leakageComparisonText(targetText)}`;
}

export function exactBilingualKey(sourceText: string, targetText: string): string {
  return `${canonicalDatasetText(sourceText)}\u001f${canonicalDatasetText(targetText)}`;
}

export function buildLeakageGroups(nodes: LeakageNode[]): Map<string, string> {
  const unionFind = new UnionFind();
  const ownersByFeature = new Map<string, string>();

  for (const node of [...nodes].sort((a, b) => a.entryId.localeCompare(b.entryId))) {
    unionFind.add(node.entryId);
  }

  const connect = (feature: string, entryId: string): void => {
    const owner = ownersByFeature.get(feature);
    if (owner === undefined) ownersByFeature.set(feature, entryId);
    else unionFind.union(owner, entryId);
  };

  for (const node of [...nodes].sort((a, b) => a.entryId.localeCompare(b.entryId))) {
    const headword = leakageComparisonText(node.headword);
    if (headword) connect(`headword\u001f${headword}`, node.entryId);
    for (const text of node.sourceTexts) {
      const normalized = leakageComparisonText(text);
      if (normalized) connect(`source\u001f${normalized}`, node.entryId);
    }
    for (const text of node.targetTexts) {
      const normalized = leakageComparisonText(text);
      if (normalized) connect(`target\u001f${normalized}`, node.entryId);
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const node of nodes) {
    const root = unionFind.find(node.entryId);
    const members = membersByRoot.get(root) ?? [];
    members.push(node.entryId);
    membersByRoot.set(root, members);
  }

  const groupByEntry = new Map<string, string>();
  for (const members of membersByRoot.values()) {
    const sorted = [...members].sort();
    const groupId = `micgrp-${sha256(sorted.join('\n')).slice(0, 20)}`;
    for (const entryId of sorted) groupByEntry.set(entryId, groupId);
  }
  return groupByEntry;
}

export function stableDatasetSplit(groupId: string, namespace = 'migmaq-online-examples-v1'): DatasetSplit {
  const digest = createHash('sha256').update(`${namespace}\u001f${groupId}`, 'utf8').digest();
  const numerator = digest.readUIntBE(0, 6);
  const ratio = numerator / 2 ** 48;
  if (ratio < 0.8) return 'train';
  if (ratio < 0.9) return 'validation';
  return 'test';
}

function addAuditKey(
  index: Map<string, { splits: Set<DatasetSplit>; rowIds: Set<string> }>,
  key: string,
  row: LeakageAuditRow,
): void {
  if (!key) return;
  const existing = index.get(key) ?? { splits: new Set<DatasetSplit>(), rowIds: new Set<string>() };
  existing.splits.add(row.split);
  existing.rowIds.add(row.id);
  index.set(key, existing);
}

export function auditSplitLeakage(rows: LeakageAuditRow[]): LeakageViolation[] {
  const dimensions: Array<{
    name: LeakageViolation['dimension'];
    keys: (row: LeakageAuditRow) => string[];
  }> = [
    { name: 'leakage_group', keys: (row) => [row.leakageGroup] },
    { name: 'entry', keys: (row) => row.entryIds },
    { name: 'headword', keys: (row) => row.headwords.map(leakageComparisonText) },
    { name: 'source_text', keys: (row) => [leakageComparisonText(row.sourceText)] },
    { name: 'target_text', keys: (row) => [leakageComparisonText(row.targetText)] },
    { name: 'bilingual_pair', keys: (row) => [bilingualComparisonKey(row.sourceText, row.targetText)] },
  ];

  const violations: LeakageViolation[] = [];
  for (const dimension of dimensions) {
    const index = new Map<string, { splits: Set<DatasetSplit>; rowIds: Set<string> }>();
    for (const row of rows) {
      for (const key of dimension.keys(row)) addAuditKey(index, key, row);
    }
    for (const [key, value] of index) {
      if (value.splits.size <= 1) continue;
      violations.push({
        dimension: dimension.name,
        keyDigest: sha256(key),
        splits: [...value.splits].sort(),
        rowIds: [...value.rowIds].sort(),
      });
    }
  }
  return violations.sort((a, b) =>
    a.dimension.localeCompare(b.dimension) || a.keyDigest.localeCompare(b.keyDigest));
}
