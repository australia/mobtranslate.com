'use client';

import { useState } from 'react';
import { Lightbulb, Plus, X } from 'lucide-react';
import { Button } from '@/app/components/ui/table';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { useToast } from '@/app/components/ui/use-toast';

interface ImprovementSuggestionFormProps {
  wordId: string;
  wordData?: any;
  onSuccess?: () => void;
}

export function ImprovementSuggestionForm({ wordId, wordData, onSuccess }: ImprovementSuggestionFormProps) {
  const [open, setOpen] = useState(false);
  const [improvementType, setImprovementType] = useState<string>('definition');
  const [fieldName, setFieldName] = useState<string>('');
  const [suggestedValue, setSuggestedValue] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [references, setReferences] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const improvementFields = {
    definition: ['definition_text', 'definition_english'],
    translation: ['translation_text', 'translation_english'],
    example: ['example_sentence', 'example_translation'],
    pronunciation: ['phonetic_spelling', 'audio_url'],
    grammar: ['word_class', 'gender', 'number'],
    cultural_context: ['cultural_note', 'usage_context']
  };

  const handleSubmit = async () => {
    if (!suggestedValue.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a suggested value',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v2/words/${wordId}/improvements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          improvement_type: improvementType,
          field_name: fieldName,
          suggested_value: suggestedValue,
          improvement_reason: reason,
          supporting_references: references.filter(r => r.trim())
        })
      });

      if (!response.ok) throw new Error('Failed to submit improvement');

      toast({
        title: 'Success',
        description: 'Improvement suggestion submitted successfully'
      });
      
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error('Error submitting improvement:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit improvement suggestion',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setImprovementType('definition');
    setFieldName('');
    setSuggestedValue('');
    setReason('');
    setReferences(['']);
  };

  const addReference = () => {
    setReferences([...references, '']);
  };

  const updateReference = (index: number, value: string) => {
    const updated = [...references];
    updated[index] = value;
    setReferences(updated);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Lightbulb className="h-4 w-4" />
          Suggest Improvement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Suggest an Improvement</DialogTitle>
          <DialogDescription>
            Help improve this word entry by suggesting corrections or additions
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="improvement-type">Improvement Type</Label>
            <Select value={improvementType} onValueChange={setImprovementType}>
              <SelectTrigger id="improvement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="definition">Definition</SelectItem>
                <SelectItem value="translation">Translation</SelectItem>
                <SelectItem value="example">Example</SelectItem>
                <SelectItem value="pronunciation">Pronunciation</SelectItem>
                <SelectItem value="grammar">Grammar</SelectItem>
                <SelectItem value="cultural_context">Cultural Context</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-name">Specific Field (optional)</Label>
            <Select value={fieldName} onValueChange={setFieldName}>
              <SelectTrigger id="field-name">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {improvementFields[improvementType as keyof typeof improvementFields]?.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggested-value">Suggested Value</Label>
            <Textarea
              id="suggested-value"
              value={suggestedValue}
              onChange={(e) => setSuggestedValue(e.target.value)}
              placeholder="Enter your suggested improvement..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Change (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change would improve the entry..."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Supporting References (optional)</Label>
            {references.map((ref, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={ref}
                  onChange={(e) => updateReference(index, e.target.value)}
                  placeholder="e.g., Dictionary name, page number, URL"
                />
                {references.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReference(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addReference}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Reference
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Suggestion'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}