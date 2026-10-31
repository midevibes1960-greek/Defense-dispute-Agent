// Core domain types — mirrors PayPal Disputes API v1 subset

export type DisputeReason =
  | "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
  | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
  | "UNAUTHORISED"
  | "CREDIT_NOT_PROCESSED"
  | "DUPLICATE_TRANSACTION";

export type DisputeStatus =
  | "OPEN"
  | "WAITING_FOR_SELLER_RESPONSE"
  | "WAITING_FOR_BUYER_RESPONSE"
  | "UNDER_REVIEW"
  | "RESOLVED";

export type LifecycleStage = "INQUIRY" | "CHARGEBACK" | "PRE_ARBITRATION" | "ARBITRATION";
export type EvidenceType = "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";
export type CaseSource = "paypal" | "manual" | "sample";
export type CaseOutcome = "open" | "under_review" | "won" | "lost" | "accepted";

export interface TrackingInfo {
  carrier_name: string;
  tracking_number: string;
  shipped_date?: string;
  delivered_date?: string;
  delivery_status?: "DELIVERED" | "IN_TRANSIT" | "EXCEPTION" | "UNKNOWN";
}

export interface OrderInfo {
  order_id: string;
  item_title: string;
  item_url?: string;
  amount: number;
  currency: string;
  buyer_email: string;
  buyer_name: string;
  purchase_date: string;
  tracking?: TrackingInfo;
  listing_text?: string;
  return_policy?: string;
  refund_id?: string;
}

export interface Dispute {
  dispute_id: string;
  reason: DisputeReason;
  reason_label: string;
  status: DisputeStatus;
  lifecycle_stage: LifecycleStage;
  dispute_amount: number;
  currency: string;
  create_time: string;
  update_time: string;
  seller_response_due_date: string;
  buyer_message?: string;
  evidence_requested: EvidenceType[];
  order: OrderInfo;
  source: CaseSource;
  outcome: CaseOutcome;
  /** Raw PayPal fields retained for audit/debug when synced. Never invented. */
  paypal?: {
    dispute_state?: string;
    seller_transaction_id?: string;
    buyer_transaction_id?: string;
    outcome_code?: string;
    links?: { href: string; rel: string; method?: string }[];
  };
  last_decision?: Decision;
}

export interface DecisionFactor {
  label: string;
  impact: number; // probability points, signed
  evidence: string;
}

export interface Decision {
  dispute_id: string;
  recommendation: "contest" | "accept";
  win_probability: number; // 0..1
  expected_value: number;
  gross_expected: number;
  contest_cost: number;
  evidence_completeness: number; // 0..1
  factors: DecisionFactor[];
  reasoning: string[];
  evidence_checklist: { label: string; done: boolean; detail?: string; kind: EvidenceType; required?: boolean }[];
  draft_note: string;
  model: string;
  ai_error?: string;
  decided_at: string;
}

export interface AuditEvent {
  id: string;
  dispute_id: string;
  at: string;
  actor: "agent" | "seller" | "paypal" | "system";
  action: string;
  detail: string;
}

export interface Submission {
  id: string;
  dispute_id: string;
  at: string;
  action: "contest" | "accept" | "offer" | "message";
  ok: boolean;
  live: boolean;
  http_status?: number;
  message: string;
  paypal_debug_id?: string;
}

export interface Metrics {
  total: number;
  open: number;
  needs_response: number;
  at_risk_24h: number;
  under_review: number;
  resolved: number;
  contested: number;
  won: number;
  lost: number;
  accepted: number;
  win_rate: number | null; // null = no decided cases yet (honest, not 100%)
  amount_at_risk: number;
  recovered: number;
  accepted_amount: number;
  currency: string;
}
