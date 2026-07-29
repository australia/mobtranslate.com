'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mobtranslate/ui';
import { AlertCircle, CheckCircle, Clock, Eye, FileSearch, FileText, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

interface SourceDocument {
  id: string;
  file_name: string;
  file_type: string;
  file_size?: number | null;
  document_type?: string | null;
  source_attribution?: string | null;
  processing_status?: string | null;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  processing_error?: unknown;
  extraction_results?: unknown;
  words_found?: number | null;
  words_new?: number | null;
  words_updated?: number | null;
  created_at: string;
  languages?: { name?: string | null; code?: string | null } | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
}

interface DocumentsResponse {
  documents?: SourceDocument[];
  pagination?: { total?: number };
  error?: string;
}

function uploader(document: SourceDocument) {
  return document.profiles?.display_name || document.profiles?.username || 'Uploader not named';
}

function formatFileSize(bytes?: number | null) {
  if (bytes === null || bytes === undefined) return 'Not recorded';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SourceDocument | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/v2/admin/documents?limit=100');
      const data = (await response.json().catch(() => ({}))) as DocumentsResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load source documents.');
      const realDocuments = Array.isArray(data.documents) ? data.documents : [];
      setDocuments(realDocuments);
      setTotal(data.pagination?.total ?? realDocuments.length);
    } catch (error) {
      setDocuments([]);
      setTotal(0);
      setLoadError(error instanceof Error ? error.message : 'Could not load source documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const processedCount = documents.filter((document) => document.processing_status === 'completed').length;
  const processingCount = documents.filter((document) => document.processing_status === 'processing').length;
  const waitingCount = documents.filter((document) => document.processing_status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Source documents</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">An honest inventory of language materials already registered with Mob Translate and their processing state.</p>
      </div>

      <Card className="border-warning/25 bg-warning/[0.06]"><CardContent className="flex gap-3 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><div><p className="text-sm font-medium">Source authority comes first</p><p className="mt-1 text-sm text-muted-foreground">Document intake and automated extraction are not enabled in this dashboard yet. Before either is connected, Mob Translate needs a working upload pipeline plus recorded attribution, access permission, cultural restrictions, and approval for each source.</p></div></CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered" value={total} icon={FileText} />
        <Metric label="Completed" value={processedCount} icon={CheckCircle} />
        <Metric label="Processing" value={processingCount} icon={FileSearch} />
        <Metric label="Waiting" value={waitingCount} icon={Clock} />
      </div>

      <Card>
        <CardHeader><CardTitle>Document register</CardTitle><CardDescription>Stored metadata only—no demonstration documents are added to this view.</CardDescription></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" aria-label="Loading documents">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted" aria-hidden="true" />)}</div>
          ) : loadError ? (
            <div className="flex flex-col items-center py-12 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Document register did not load</p><p className="mt-2 max-w-xl text-sm text-muted-foreground">{loadError}</p><Button className="mt-5" variant="outline" onClick={() => void fetchDocuments()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center"><FileText className="mx-auto mb-4 h-11 w-11 text-muted-foreground" /><p className="text-lg font-medium">No source documents registered</p><p className="mt-1 text-sm text-muted-foreground">This is the real empty state. Add intake only after the permissions workflow is ready.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Language</TableHead><TableHead>Type</TableHead><TableHead>Size</TableHead><TableHead>Status</TableHead><TableHead>Registered</TableHead><TableHead className="text-right">Details</TableHead></TableRow></TableHeader>
                <TableBody>{documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell><p className="font-medium">{document.file_name}</p><p className="mt-1 text-xs text-muted-foreground">by {uploader(document)}</p></TableCell>
                    <TableCell>{document.languages?.name || 'Not assigned'}</TableCell>
                    <TableCell><code className="rounded bg-muted px-2 py-1 text-xs">{document.document_type || document.file_type.split('/').pop() || document.file_type}</code></TableCell>
                    <TableCell>{formatFileSize(document.file_size)}</TableCell>
                    <TableCell><StatusBadge status={document.processing_status} /></TableCell>
                    <TableCell>{new Date(document.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" aria-label={`View details for ${document.file_name}`} onClick={() => setSelected(document)}><Eye className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogPortal><DialogBackdrop /><DialogPopup className="max-w-2xl">
          <DialogTitle>{selected?.file_name || 'Document details'}</DialogTitle>
          {selected ? <div className="mt-5 space-y-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Language" value={selected.languages?.name || 'Not assigned'} />
              <Detail label="Status" value={statusLabel(selected.processing_status)} />
              <Detail label="File type" value={selected.file_type} />
              <Detail label="File size" value={formatFileSize(selected.file_size)} />
              <Detail label="Registered by" value={uploader(selected)} />
              <Detail label="Registered" value={new Date(selected.created_at).toLocaleString()} />
              <Detail label="Source attribution" value={selected.source_attribution || 'Not recorded'} />
              <Detail label="Words found" value={String(selected.words_found ?? 0)} />
              <Detail label="New candidates" value={String(selected.words_new ?? 0)} />
              <Detail label="Existing entries touched" value={String(selected.words_updated ?? 0)} />
            </dl>
            {selected.processing_error ? <div className="rounded-lg border border-error/20 bg-error/5 p-3"><p className="flex items-center gap-2 text-sm font-medium text-error"><XCircle className="h-4 w-4" />Processing error</p><pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{typeof selected.processing_error === 'string' ? selected.processing_error : JSON.stringify(selected.processing_error, null, 2)}</pre></div> : null}
            <div className="flex justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          </div> : null}
        </DialogPopup></DialogPortal>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof FileText }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{label}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">From registered records</p></CardContent></Card>;
}

function StatusBadge({ status }: { status?: string | null }) {
  const value = status || 'unknown';
  const config: Record<string, { variant: 'primary' | 'secondary' | 'error' | 'outline'; icon: typeof Clock }> = {
    pending: { variant: 'secondary', icon: Clock },
    processing: { variant: 'outline', icon: FileSearch },
    completed: { variant: 'primary', icon: CheckCircle },
    failed: { variant: 'error', icon: XCircle },
  };
  const { variant, icon: Icon } = config[value] || { variant: 'secondary' as const, icon: AlertCircle };
  return <Badge variant={variant} className="w-fit"><Icon className="mr-1 h-3.5 w-3.5" />{statusLabel(value)}</Badge>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}
