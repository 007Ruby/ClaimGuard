// types/db.ts — enum unions (kept in sync with the SQL enums)
export type EventType    = 'late_drawings' | 'variation' | 'site_access_restriction' | 'delayed_instruction' | 'other';
export type EventStatus  = 'identified' | 'in_review' | 'notice_due' | 'notice_issued' | 'claimed' | 'closed' | 'dismissed';
export type EvidenceType   = 'email' | 'photo' | 'pdf' | 'drawing' | 'site_report' | 'other';
export type EvidenceStatus = 'inbox' | 'linked' | 'ignored';
export type DeadlineType   = 'notice' | 'claim_submission' | 'follow_up';
export type DeadlineStatus = 'upcoming' | 'met' | 'missed' | 'dismissed';
export type ClaimStatus    = 'draft' | 'ready' | 'submitted' | 'resolved' | 'rejected';
export type AiSuggestionType   = 'classify_document' | 'suggest_event' | 'link_event' | 'missing_evidence' | 'generate_notice' | 'generate_claim';
export type AiSuggestionStatus = 'pending' | 'accepted' | 'dismissed';

// Representative row type (the rest follow the same shape, generated from schema)
export interface EventRow {
  id: string; org_id: string; project_id: string;
  title: string; type: EventType; status: EventStatus;
  description: string | null; occurred_on: string | null;
  created_by: string; created_at: string; updated_at: string;
}