import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@mobtranslate/ui';
import { 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  MessageSquare,
  TrendingUp,
  Shield,
  Heart,
  Users,
  Globe
} from 'lucide-react';

export default function GuidelinesPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Curator Guidelines</h1>
        <p className="text-muted-foreground mt-2">
          Essential guidelines for maintaining quality and cultural integrity
        </p>
      </div>

      {/* Core Principles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-error" />
            Core Principles
          </CardTitle>
          <CardDescription>
            The foundation of our curation approach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <Globe className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium">Cultural Respect</h3>
                <p className="text-sm text-muted-foreground">
                  Always prioritize cultural authenticity and respect Indigenous knowledge systems. 
                  When in doubt, consult with language Elders or cultural authorities.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Users className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium">Community First</h3>
                <p className="text-sm text-muted-foreground">
                  Our platform serves Indigenous communities. Ensure all content supports 
                  language revitalization and respects community protocols.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium">Quality Over Quantity</h3>
                <p className="text-sm text-muted-foreground">
                  It's better to have fewer high-quality, accurate entries than many questionable ones. 
                  Take time to verify accuracy.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Word Review Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Word Review Guidelines
          </CardTitle>
          <CardDescription>
            Standards for approving or rejecting word submissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium text-success flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4" />
              Approve When:
            </h3>
            <ul className="space-y-2 text-sm ml-6">
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">•</span>
                <span>The word and translation are accurate according to reliable sources</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">•</span>
                <span>Pronunciation guides follow established orthographic conventions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">•</span>
                <span>Cultural context is appropriately included where relevant</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">•</span>
                <span>Example sentences demonstrate proper usage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">•</span>
                <span>The submission respects dialectal variations when noted</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-error flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4" />
              Reject When:
            </h3>
            <ul className="space-y-2 text-sm ml-6">
              <li className="flex items-start gap-2">
                <span className="text-error mt-0.5">•</span>
                <span>The translation is clearly incorrect or misleading</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-error mt-0.5">•</span>
                <span>Sacred or restricted knowledge is shared without authorization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-error mt-0.5">•</span>
                <span>The submission contains offensive or inappropriate content</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-error mt-0.5">•</span>
                <span>Duplicate entries exist (unless dialectal variation)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-error mt-0.5">•</span>
                <span>The submission lacks essential information (translation, part of speech)</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-warning flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4" />
              Request Improvements When:
            </h3>
            <ul className="space-y-2 text-sm ml-6">
              <li className="flex items-start gap-2">
                <span className="text-warning mt-0.5">•</span>
                <span>Minor spelling corrections are needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning mt-0.5">•</span>
                <span>Additional context would enhance understanding</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning mt-0.5">•</span>
                <span>Pronunciation guide needs adjustment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning mt-0.5">•</span>
                <span>Example sentences could better demonstrate usage</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Comment Moderation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-foreground" />
            Comment Moderation
          </CardTitle>
          <CardDescription>
            Maintaining respectful and constructive discussions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-medium mb-2">Remove Comments That:</h3>
              <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                <li>• Contain hate speech, discrimination, or personal attacks</li>
                <li>• Share misinformation about the language or culture</li>
                <li>• Include spam, advertisements, or irrelevant content</li>
                <li>• Violate community guidelines or platform policies</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Encourage Comments That:</h3>
              <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                <li>• Provide constructive feedback or corrections</li>
                <li>• Share additional cultural context or usage examples</li>
                <li>• Ask genuine questions about language learning</li>
                <li>• Celebrate language preservation efforts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Improvement Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-success" />
            Reviewing Improvement Suggestions
          </CardTitle>
          <CardDescription>
            Evaluating community contributions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm">
              Community members may suggest improvements to existing entries. When reviewing these:
            </p>
            
            <div className="bg-primary/10 p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-primary">Consider the Source</h4>
              <ul className="space-y-1 text-sm text-primary">
                <li>• Check the contributor's accuracy rate and history</li>
                <li>• Prioritize suggestions from native speakers</li>
                <li>• Look for consensus among multiple suggestions</li>
              </ul>
            </div>
            
            <div className="bg-success/10 p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-success">Verify Changes</h4>
              <ul className="space-y-1 text-sm text-success">
                <li>• Cross-reference with authoritative sources</li>
                <li>• Consider dialectal variations</li>
                <li>• Ensure changes improve accuracy, not just preference</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Special Considerations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            Special Considerations
          </CardTitle>
          <CardDescription>
            Important cultural and linguistic factors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Sacred and Restricted Content</h3>
              <p className="text-sm text-muted-foreground">
                Some words, stories, or cultural knowledge may be restricted to certain 
                individuals or groups. Always err on the side of caution and consult 
                with appropriate cultural authorities when uncertain.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Dialectal Variations</h3>
              <p className="text-sm text-muted-foreground">
                Many Indigenous languages have regional dialects. Rather than treating 
                variations as "incorrect," document them appropriately with regional labels.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Orthographic Standards</h3>
              <p className="text-sm text-muted-foreground">
                Follow established writing systems for each language. If multiple systems 
                exist, be consistent within the platform and clearly indicate which system 
                is being used.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
          <CardDescription>
            Helpful references for curators
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">Contact</Badge>
            <span>Language Elder Advisory Board: elders@mobtranslate.com</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">Training</Badge>
            <span>Monthly curator training sessions (first Tuesday of each month)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">Support</Badge>
            <span>Curator support channel: #curator-help on Discord</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}