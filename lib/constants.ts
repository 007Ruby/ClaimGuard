export const EVENT_TYPE_LABELS: Record<string, string> = {
  late_drawings: "Late drawings",
  variation: "Variation",
  site_access_restriction: "Site access restriction",
  delayed_instruction: "Delayed instruction",
  other: "Other",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  identified: "Identified",
  in_review: "In review",
  notice_due: "Notice due",
  notice_issued: "Notice issued",
  claimed: "Claimed",
  closed: "Closed",
  dismissed: "Dismissed",
};

export const EVENT_STATUS_OPTIONS = Object.keys(EVENT_STATUS_LABELS);
export const EVENT_TYPE_OPTIONS = Object.keys(EVENT_TYPE_LABELS);