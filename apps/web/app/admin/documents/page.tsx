'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components';
import { Badge } from '@ui/components/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ui/components/dialog';
import { Input } from '@ui/components/input';
import { Label } from '@ui/components/label';
import { Textarea } from '@ui/components/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { 
  FileText, 
  Upload, 
  Download, 
  Eye, 
  Trash2, 
  Clock,
  CheckCircle,
  XCircle,
  FileSearch,
  Calendar
} from 'lucide-react';

interface Document {
  id: string;
  title: string;
  description?: string;
  file_type: string;
  file_size: number;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  language_id: string;
  language_name?: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  processed_at?: string;
  created_at: string;
  word_count?: number;
  extraction_results?: any;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/v2/admin/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const response = await fetch('/api/v2/admin/documents/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Document uploaded successfully'
        });
        setIsUploadDialogOpen(false);
        fetchDocuments();
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload document',
        variant: 'destructive'
      });
    }
  };

  const handleProcess = async (documentId: string) => {
    try {
      const response = await fetch(`/api/v2/admin/documents/${documentId}/process`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Document processing started'
        });
        fetchDocuments();
      }
    } catch (error) {
      console.error('Failed to process document:', error);
      toast({
        title: 'Error',
        description: 'Failed to process document',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`/api/v2/admin/documents/${documentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Document deleted successfully'
        });
        fetchDocuments();
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive'
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  };

  const getStatusBadge = (status: Document['status']) => {
    const variants: Record<Document['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      processing: { variant: 'outline', icon: FileSearch },
      processed: { variant: 'default', icon: CheckCircle },
      failed: { variant: 'destructive', icon: XCircle }
    };

    const { variant, icon: Icon } = variants[status];
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Mock data for demonstration
  const mockDocuments: Document[] = [
    {
      id: '1',
      title: 'Kuku Yalanji Dictionary PDF',
      description: 'Complete dictionary with audio transcriptions',
      file_type: 'application/pdf',
      file_size: 5242880,
      status: 'processed',
      language_id: '1',
      language_name: 'Kuku Yalanji',
      uploaded_by: '1',
      uploaded_by_name: 'Admin User',
      processed_at: '2024-01-28T10:30:00Z',
      created_at: '2024-01-28T10:00:00Z',
      word_count: 1250
    },
    {
      id: '2',
      title: 'Yawuru Language Guide',
      description: 'Community language learning guide',
      file_type: 'application/pdf',
      file_size: 3145728,
      status: 'processing',
      language_id: '2',
      language_name: 'Yawuru',
      uploaded_by: '1',
      uploaded_by_name: 'Admin User',
      created_at: '2024-01-28T11:00:00Z'
    },
    {
      id: '3',
      title: 'Grammar Notes - Warlpiri',
      description: 'Detailed grammar documentation',
      file_type: 'text/markdown',
      file_size: 524288,
      status: 'pending',
      language_id: '3',
      language_name: 'Warlpiri',
      uploaded_by: '2',
      uploaded_by_name: 'Jane Curator',
      created_at: '2024-01-28T12:00:00Z'
    }
  ];

  const displayDocuments = documents.length > 0 ? documents : mockDocuments;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Manage uploaded documents and extraction pipeline
          </p>
        </div>
        <Button onClick={() => setIsUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Documents
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayDocuments.length}</div>
            <p className="text-xs text-muted-foreground">
              All uploaded documents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Processed
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {displayDocuments.filter(d => d.status === 'processed').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Successfully processed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Processing
            </CardTitle>
            <FileSearch className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {displayDocuments.filter(d => d.status === 'processing').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending
            </CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {displayDocuments.filter(d => d.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting processing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Documents</CardTitle>
          <CardDescription>
            Uploaded documents and their processing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    Loading documents...
                  </TableCell>
                </TableRow>
              ) : displayDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No documents found
                  </TableCell>
                </TableRow>
              ) : (
                displayDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground">{doc.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{doc.language_name || 'N/A'}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {doc.file_type.split('/')[1] || doc.file_type}
                      </code>
                    </TableCell>
                    <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                    <TableCell>{getStatusBadge(doc.status)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{new Date(doc.created_at).toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground">
                          by {doc.uploaded_by_name || 'Unknown'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setIsDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {doc.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleProcess(doc.id)}
                          >
                            <FileSearch className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpload}>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document for linguistic data extraction
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Document title"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Brief description of the document"
                  rows={3}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="language_id">Language</Label>
                <Select name="language_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Kuku Yalanji</SelectItem>
                    <SelectItem value="2">Yawuru</SelectItem>
                    <SelectItem value="3">Warlpiri</SelectItem>
                    <SelectItem value="4">Arrernte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="file">File</Label>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Supported formats: PDF, TXT, MD, DOCX (max 10MB)
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
          </DialogHeader>
          
          {selectedDocument && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">General Information</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Title:</dt>
                  <dd>{selectedDocument.title}</dd>
                  
                  <dt className="text-muted-foreground">Language:</dt>
                  <dd>{selectedDocument.language_name || 'N/A'}</dd>
                  
                  <dt className="text-muted-foreground">Status:</dt>
                  <dd>{getStatusBadge(selectedDocument.status)}</dd>
                  
                  <dt className="text-muted-foreground">File Type:</dt>
                  <dd>{selectedDocument.file_type}</dd>
                  
                  <dt className="text-muted-foreground">File Size:</dt>
                  <dd>{formatFileSize(selectedDocument.file_size)}</dd>
                  
                  <dt className="text-muted-foreground">Uploaded:</dt>
                  <dd>{new Date(selectedDocument.created_at).toLocaleString()}</dd>
                </dl>
              </div>

              {selectedDocument.status === 'processed' && (
                <div>
                  <h3 className="font-semibold mb-2">Processing Results</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Processed at:</dt>
                    <dd>{selectedDocument.processed_at ? new Date(selectedDocument.processed_at).toLocaleString() : 'N/A'}</dd>
                    
                    <dt className="text-muted-foreground">Words extracted:</dt>
                    <dd>{selectedDocument.word_count || 0}</dd>
                  </dl>
                </div>
              )}

              {selectedDocument.description && (
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-sm">{selectedDocument.description}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}