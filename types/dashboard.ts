// types/dashboard.ts — the "What's Next" card model
export interface WhatsNextCard {
  id: string;
  kind: 'notice_due' | 'missing_evidence' | 'claim_incomplete' | 'ai_suggestion' | 'event_review';
  title: string; description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  action: { label: string; href: string };
}