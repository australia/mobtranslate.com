'use client';

import { useState } from 'react';
import { Lightbulb, Plus, X } from 'lucide-react';
import { Button, Input, Textarea, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue, Dialog, DialogPortal, DialogBackdrop, DialogPopup, DialogDescription, DialogTitle, DialogTrigger } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';

interface ImprovementSuggestionFormProps {
  wordId: string;
  wordData?: any;
  onSuccess?: () => void;
}

export function ImprovementSuggestionForm({ wordId, wordData: _wordData, onSuccess }: ImprovementSuggestionFormProps) {
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
        variant: 'error'
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
        variant: 'error'
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
      <DialogTrigger className="mt-btn mt-btn-outline mt-btn-md gap-2">
        <Lightbulb className="h-4 w-4" />
        Suggest Improvement
      </DialogTrigger>
      <DialogPortal><DialogBackdrop /><DialogPopup className="sm:max-w-[600px]">
          <DialogTitle>Suggest an Improvement</DialogTitle>
          <DialogDescription>
            Help improve this word entry by suggesting corrections or additions
          </DialogDescription>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="improvement-type" className="text-sm font-medium">Improvement Type</label>
            <Select value={improvementType} onValueChange={(v) => v != null && setImprovementType(v)}>
              <SelectTrigger id="improvement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectPortal><SelectPositioner><SelectPopup>
                <SelectItem value="definition">Definition</SelectItem>
                <SelectItem value="translation">Translation</SelectItem>
                <SelectItem value="example">Example</SelectItem>
                <SelectItem value="pronunciation">Pronunciation</SelectItem>
                <SelectItem value="grammar">Grammar</SelectItem>
                <SelectItem value="cultural_context">Cultural Context</SelectItem>
              </SelectPopup></SelectPositioner></SelectPortal>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="field-name" className="text-sm font-medium">Specific Field (optional)</label>
            <Select value={fieldName} onValueChange={(v) => v != null && setFieldName(v)}>
              <SelectTrigger id="field-name">
                <SelectValue />
              </SelectTrigger>
              <SelectPortal><SelectPositioner><SelectPopup>
                {improvementFields[improvementType as keyof typeof improvementFields]?.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectPopup></SelectPositioner></SelectPortal>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="suggested-value" className="text-sm font-medium">Suggested Value</label>
            <Textarea
              id="suggested-value"
              value={suggestedValue}
              onChange={(e) => setSuggestedValue(e.target.value)}
              placeholder="Enter your suggested improvement..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium">Reason for Change (optional)</label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change would improve the entry..."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Supporting References (optional)</label>
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
      </DialogPopup></DialogPortal>
    </Dialog>
  );
}