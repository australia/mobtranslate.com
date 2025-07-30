'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/app/components/ui/card';
import { type ImageAnalysis } from '@/lib/tools/image-analysis';
import { 
  Image as ImageIcon, 
  Languages, 
  BookOpen, 
  Lightbulb,
  Globe,
  Heart,
  Eye,
  Sparkles
} from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface ImageAnalysisCardProps {
  analysis: ImageAnalysis;
}

export function ImageAnalysisCard({ analysis }: ImageAnalysisCardProps) {
  const [selectedObject, setSelectedObject] = React.useState<number | null>(null);
  const [activeTab, setActiveTab] = React.useState<'objects' | 'insights' | 'tips'>('objects');

  return (
    <Card className="w-full max-w-4xl mx-auto animate-slide-in">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-indigo-500" />
            Image Analysis
          </CardTitle>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {analysis.detectedObjects.length} objects
          </Badge>
        </div>
        <p className="text-base leading-relaxed text-gray-600">
          {analysis.imageDescription}
        </p>
      </CardHeader>

      <CardContent>
        <div className="w-full">
          {/* Tab Navigation */}
          <div className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
            <button
              onClick={() => setActiveTab('objects')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'objects' 
                  ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              Detected Objects
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'insights' 
                  ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              Cultural Insights
            </button>
            <button
              onClick={() => setActiveTab('tips')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'tips' 
                  ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              Learning Tips
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'objects' && (
            <div className="space-y-4">
            <div className="grid gap-4">
              {analysis.detectedObjects.map((obj, index) => (
                <div
                  key={index}
                  className={cn(
                    "border rounded-lg p-4 cursor-pointer transition-all",
                    "hover:border-indigo-300 hover:bg-indigo-50/50",
                    selectedObject === index && "border-indigo-500 bg-indigo-50"
                  )}
                  onClick={() => setSelectedObject(selectedObject === index ? null : index)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg capitalize flex items-center gap-2">
                      <Globe className="h-5 w-5 text-indigo-500" />
                      {obj.object}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {Math.round(obj.confidence * 100)}% confident
                    </Badge>
                  </div>

                  {obj.translations.length > 0 ? (
                    <div className="space-y-2">
                      {obj.translations.map((trans, tIndex) => (
                        <div 
                          key={tIndex}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <Languages className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-indigo-600">
                                {trans.word}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {trans.language}
                              </Badge>
                            </div>
                            {trans.definition && (
                              <p className="text-sm text-gray-600 mt-1">
                                {trans.definition}
                              </p>
                            )}
                            {selectedObject === index && trans.culturalContext && (
                              <p className="text-sm text-gray-500 mt-2 italic">
                                {trans.culturalContext}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      No translations found in the dictionary
                    </p>
                  )}
                </div>
              ))}
            </div>

            {analysis.relatedWords && analysis.relatedWords.length > 0 && (
              <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  Related Concepts
                </h4>
                <div className="space-y-2">
                  {analysis.relatedWords.map((word, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="font-medium">{word.word}</span>
                      <span className="text-sm text-gray-600">{word.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          )}

          {activeTab === 'insights' && (
            <div className="space-y-4">
            {analysis.culturalInsights ? (
              <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 leading-relaxed">
                    {analysis.culturalInsights}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No cultural insights available
              </p>
            )}
            </div>
          )}

          {activeTab === 'tips' && (
            <div className="space-y-4">
            {analysis.learningTips && analysis.learningTips.length > 0 ? (
              <div className="space-y-3">
                {analysis.learningTips.map((tip, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-3 p-4 bg-green-50 rounded-lg"
                  >
                    <Lightbulb className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">{tip}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No learning tips available
              </p>
            )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}