'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, cn, Button } from '@mobtranslate/ui';
import { type ImageAnalysis } from '@/lib/tools/image-analysis';
import {
  Image as ImageIcon,
  Languages,
  BookOpen,
  Lightbulb,
  Globe,
  Eye,
  Sparkles
} from 'lucide-react';

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
            <ImageIcon className="h-6 w-6 text-primary" />
            Image Analysis
          </CardTitle>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {analysis.detectedObjects.length} objects
          </Badge>
        </div>
        <p className="text-base leading-relaxed text-muted-foreground">
          {analysis.imageDescription}
        </p>
      </CardHeader>

      <CardContent>
        <div className="w-full">
          {/* Tab Navigation */}
          <div className="grid w-full grid-cols-3 bg-muted rounded-lg p-1 mb-6">
            <Button
              variant="ghost"
              onClick={() => setActiveTab('objects')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'objects'
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Detected Objects
            </Button>
            <Button
              variant="ghost"
              onClick={() => setActiveTab('insights')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'insights'
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Cultural Insights
            </Button>
            <Button
              variant="ghost"
              onClick={() => setActiveTab('tips')}
              className={cn(
                "py-2 px-4 rounded-md text-sm font-medium transition-all",
                activeTab === 'tips'
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Learning Tips
            </Button>
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
                    "hover:border-primary/30 hover:bg-primary/5",
                    selectedObject === index && "border-primary bg-primary/10"
                  )}
                  onClick={() => setSelectedObject(selectedObject === index ? null : index)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg capitalize flex items-center gap-2">
                      <Globe className="h-5 w-5 text-primary" />
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
                          className="flex items-start gap-3 p-3 bg-muted rounded-lg"
                        >
                          <Languages className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-primary">
                                {trans.word}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {trans.language}
                              </Badge>
                            </div>
                            {trans.definition && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {trans.definition}
                              </p>
                            )}
                            {selectedObject === index && trans.culturalContext && (
                              <p className="text-sm text-muted-foreground mt-2 italic">
                                {trans.culturalContext}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No translations found in the dictionary
                    </p>
                  )}
                </div>
              ))}
            </div>

            {analysis.relatedWords && analysis.relatedWords.length > 0 && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-foreground" />
                  Related Concepts
                </h4>
                <div className="space-y-2">
                  {analysis.relatedWords.map((word, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="font-medium">{word.word}</span>
                      <span className="text-sm text-muted-foreground">{word.reason}</span>
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
              <div className="p-6 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-foreground leading-relaxed">
                    {analysis.culturalInsights}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
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
                    className="flex items-start gap-3 p-4 bg-success/10 rounded-lg"
                  >
                    <Lightbulb className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">{tip}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
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
