// types/ai.ts — the structured contract returned by the AI service layer
export interface DocumentAnalysis {
  documentType: EvidenceType;
  possibleEvent: EventType | null;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  missingEvidence: string[];
  recommendedAction: 'create_event' | 'link_event' | 'generate_notice' | 'generate_claim' | 'ignore';
}

export interface AiSuggestionView {
  id: string; type: AiSuggestionType; status: AiSuggestionStatus;
  confidence: 'low' | 'medium' | 'high' | null;
  payload: DocumentAnalysis | Record<string, unknown>;
}