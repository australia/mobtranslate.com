import { z } from 'zod';

// Schema for detected objects with translations
export const DetectedObjectSchema = z.object({
  object: z.string().describe('The detected object in English'),
  confidence: z.number().describe('Confidence score of detection'),
  translations: z.array(z.object({
    language: z.string(),
    languageCode: z.string(),
    word: z.string(),
    definition: z.string().optional(),
    culturalContext: z.string().optional(),
  })),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
});

// Schema for the complete image analysis result
export const ImageAnalysisSchema = z.object({
  imageDescription: z.string().describe('Overall description of the image'),
  detectedObjects: z.array(DetectedObjectSchema),
  culturalInsights: z.string().optional().describe('Cultural context or insights about the objects'),
  learningTips: z.array(z.string()).optional().describe('Tips for learning these words'),
  relatedWords: z.array(z.object({
    word: z.string(),
    language: z.string(),
    reason: z.string(),
  })).optional(),
});

// Tool parameters
export const AnalyzeImageToolSchema = z.object({
  imageUrl: z.string().describe('URL or base64 of the image to analyze'),
  languages: z.array(z.string()).optional().describe('Specific language codes to translate to'),
  includeContext: z.boolean().default(true).describe('Include cultural context'),
});

export type DetectedObject = z.infer<typeof DetectedObjectSchema>;
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
export type AnalyzeImageParams = z.infer<typeof AnalyzeImageToolSchema>;