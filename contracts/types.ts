// Mirrors contracts/models.py. Keep in sync; change only with all layer owners agreeing.

export type Category =
  | "pothole" | "streetlight_out" | "traffic_signal" | "sidewalk_damage" | "manhole_cover"
  | "road_debris" | "graffiti" | "illegal_dumping" | "downed_tree" | "flooding" | "other";
export type ClusterStatus = "reported" | "assigned" | "in_progress" | "fixed";
export type TicketStage = "queued" | "work_in_progress" | "resolved" | "canceled";
export type TicketSeverity = "blocker" | "high" | "medium" | "low";
export type Bucket = "P1" | "P2" | "P3" | "P4";
export type ReportKind = "first" | "confirm" | "photo_confirm";
export type Outcome = "created" | "merged" | "rejected";
export type EventType =
  | "report.received" | "cluster.created" | "cluster.merged" | "cluster.updated"
  | "agent.node" | "ticket.created" | "ticket.updated" | "stats.updated"
  | "simulate.progress" | "reset";

export interface Triage {
  is_valid: boolean; invalid_reason?: string | null; category: Category; severity: number;
  is_safety_hazard: boolean; hazard_description: string; confidence: number;
}
export interface EdgeInfo { hit: boolean; ms: number; cell: string }
export interface Ticket {
  id: string; cluster_id: string; title: string; body: string; severity: TicketSeverity;
  stage: TicketStage; vendor?: string | null; tags: string[]; created_at: string; updated_at: string;
}
export interface Cluster {
  id: string; category: Category; lat: number; lng: number; status: ClusterStatus;
  severity: number; is_hazard: boolean; hazard_description: string;
  reporter_count: number; report_count: number; priority: number; bucket: Bucket;
  rationale: string; location_crit: number; neighborhood?: string | null; district?: string | null; zones?: string[]; address?: string | null;
  photo_url?: string | null; ticket_id?: string | null; vendor?: string | null; simulated: boolean;
  first_reported_at: string; last_reported_at: string; fixed_at?: string | null;
}
export interface Report {
  id: string; cluster_id: string; user_id: string; lat: number; lng: number; accuracy_m: number;
  category: Category; note: string; photo_url?: string | null; phash?: string | null;
  kind: ReportKind; simulated: boolean; created_at: string;
}
export interface AgentStep {
  node: "intake" | "dedup" | "judge" | "priority" | "dispatch";
  status: "start" | "done" | "skipped" | "error"; ms: number; summary: string; model?: string | null;
}
export interface ReportResult {
  outcome: Outcome; message: string; report_id?: string | null; cluster?: Cluster | null;
  neighbors: number; points_awarded: number; xp_total: number; level: string;
  priority_before?: number | null; priority_after?: number | null; ticket?: Ticket | null;
  edge?: EdgeInfo | null; reject_reason?: string | null; steps: AgentStep[]; my_photo_url?: string | null;
}
export interface NearbyResult { clusters: Cluster[]; edge: EdgeInfo }
export interface TimelineEntry { ts: string; label: string; detail: string }
export interface ClusterDetail {
  cluster: Cluster; ticket?: Ticket | null; reports: Report[]; timeline: TimelineEntry[]; agent_trace: AgentStep[];
}
export interface Badge { id: string; name: string; description: string; earned: boolean }
export interface Profile {
  user_id: string; name: string; neighborhood: string; xp: number; level: string; next_level_xp: number;
  streak_weeks: number; reports: number; confirmations: number; fixed: number; badges: Badge[];
}
export interface LeaderboardEntry { rank: number; name: string; xp: number; reports: number; neighborhood: string; is_you: boolean }
export interface Stats {
  total_reports: number; unique_clusters: number; duplicates_absorbed: number; llm_calls_avoided: number;
  open_clusters: number; fixed_clusters: number; tickets: number; edge_hits: number; edge_misses: number; avg_edge_ms: number;
}
export interface CivicEvent { id: number; type: EventType; ts: string; data: Record<string, any> }
export interface Flags {
  model_provider: string; agents_mode: "graph" | "det"; vision: boolean; devrev_mode: "mock" | "live";
  storage: "local" | "s3"; edgekv_backend: "memory" | "valkey" | "edge"; demo_mode: boolean;
}
export interface SimulateRequest {
  count: number; lat: number; lng: number; spread_m: number; category: Category; users: number; rate_per_s: number;
}
export interface VendorOrder { cluster: Cluster; ticket?: Ticket | null; due: string }
export interface Health { status: string; flags: Flags; services: Record<string, string> }
export interface Impact {
  headline: string;
  facts: { label: string; value: string; note: string; estimate: boolean; source: string }[];
}

export interface CategorySuggestion { category: Category; confidence: number; source: "akamai-embedding" | "keywords" }
export interface AIModelUsage {
  name: string; provider: string; calls: number; errors: number; avg_ms: number; last_ms: number; tokens: number | null;
}
export interface AIUsage { models: AIModelUsage[]; since: string }

export interface ZoneHit { type: "school" | "hospital" | "arterial"; name: string; distance_m: number; radius_m: number; boost: number }
export interface GeoInfo {
  in_service_area: boolean; neighborhood?: string | null; district?: string | null; zones: ZoneHit[]; message?: string | null;
}

// ---- DevRev case-flow board
export type StageKey = "queued" | "assigned" | "in_progress" | "awaiting_verification" | "resolved";
export interface BoardTicket {
  id: string; devrev_id: string | null; title: string; cluster_id: string; stage_key: StageKey;
  severity: "blocker" | "high" | "medium" | "low"; priority_bucket: "P1" | "P2" | "P3" | "P4";
  vendor: string | null; owner: string | null; neighborhood: string | null; district: string | null; zones: string[];
  reporters: number; age_s: number; due: string | null; overdue: boolean; escalated: boolean;
  evidence_count: number; web_url: string | null;
}
export interface BoardStage { key: StageKey; label: string; count: number; avg_age_s: number | null; tickets: BoardTicket[] }
export interface Board {
  source: "devrev" | "local board"; as_of: string; stages: BoardStage[];
  totals: { open: number; overdue: number; escalated: number; resolved: number; median_ttr: string | null; unsynced?: number };
}
export interface JourneyStep {
  ts: string; source: "civicflow" | "devrev" | "agent";
  kind: "report" | "vision" | "geofence" | "dedup" | "priority" | "routing" | "created" | "stage" | "comment"
    | "escalated" | "verification" | "resolved" | "reopened";
  title: string; detail: string;
}
export interface Journey { ticket: BoardTicket; steps: JourneyStep[] }
export interface TicketAction { action: "start" | "request_verification" | "approve" | "escalate" | "reopen"; note?: string | null }
export interface TicketActionResult { ok: boolean; ticket: BoardTicket | null; error: string | null }
export interface TicketEventRow {
  ts: string; kind: "created" | "stage" | "comment" | "escalated" | "verification" | "resolved" | "reopened";
  ticket_id: string; devrev_id: string | null; text: string; source: "DevRev" | "Civic Flow" | "Agent";
}

// ---- citizen app: GET /api/me/requests, GET /api/me/requests/{cluster_id}
export interface CitizenTimelineItem { ts: string; label: string; detail: string }
export type CitizenStatus = "reported" | "assigned" | "in_progress" | "awaiting_verification" | "fixed";
export interface CitizenRequest {
  id: string; category: Category; title: string; address?: string | null; neighborhood?: string | null;
  district?: string | null; zones: string[]; photo_url?: string | null; my_photo_url?: string | null; issue_photo_url?: string | null; neighbors: number;
  status: CitizenStatus;
  stage_label: "Reported" | "Crew assigned" | "Work in progress" | "Awaiting verification" | "Fixed";
  ticket_id?: string | null; crew?: string | null; due?: string | null; priority_bucket: Bucket;
  rationale: string;
  detected: { category: Category; severity: number; is_hazard: boolean; hazard_description: string };
  my_points: number; created_at: string; updated_at: string; timeline: CitizenTimelineItem[];
  my_note?: string | null; my_category?: Category | null; my_severity?: number | null; my_reported_at?: string | null;
}

// ---- Workflow page "case journey": GET /api/devrev/cases, GET /api/devrev/ticket/{id}/case
export type CaseReason = "new" | "approval" | "overdue" | "escalated" | "no_crew";
export interface CaseCounts { open: number; new: number; approval: number; overdue: number; escalated: number; no_crew: number; needs_you: number; agent_closed: number }
export interface CaseRow extends BoardTicket { reasons: CaseReason[] }
export interface CaseList { source: "devrev" | "local board"; as_of: string; total: number; counts: CaseCounts; items: CaseRow[]; semantic: boolean }
export interface FactorBar { label: string; value: string; pct: number }
export interface DevrevRecord {
  display_id: string | null; stage: string | null; severity: string | null; part: string | null; owner: string | null;
  external_ref: string | null; web_url: string | null; synced: boolean;
}
export interface Station {
  key: "reported" | "understood" | "ticket" | "crew" | "verify" | "told"; title: string; detail: string;
  state: "done" | "now" | "todo"; chip: string; chip_source: "civicflow" | "devrev" | "agent"; ts: string | null;
}
export type CaseAction = "start" | "request_verification" | "approve" | "escalate" | "reopen";
export interface CaseDetail {
  ticket: BoardTicket; category: string; address: string | null; before_photo_url: string | null; after_photo_url: string | null;
  crew_note: string | null; priority_score: number; rationale: string; factors: FactorBar[]; duplicates_avoided: number;
  devrev: DevrevRecord; stations: Station[]; timeline: JourneyStep[]; can: CaseAction[]; agent: AgentVerdict | null;
}

// ---- agentic fix verification
export interface AgentVerdict {
  state: "none" | "checking" | "recommends_approve" | "recommends_review" | "auto_approved" | "skipped";
  decision: "approve" | "review" | null; confidence: number; reason: string; observation: string; policy_note: string;
  checked_at: string | null; eyes: string; brain: string;
}
export interface AutonomyPolicy {
  mode: "off" | "suggest" | "auto"; auto_buckets: Bucket[]; min_confidence: number; always_human: string[];
  closed_by_agent: number; recommended: number;
}
// ---- Impact page and judges' page
export interface DistrictCount { label: string; duplicates: number }
export interface AgentSplit { closed_by_agent: number; on_track: number; needs_person: number; total: number }
export interface ImpactFact { label: string; value: string; note: string; estimate: boolean; source: string }
export interface ImpactLive {
  as_of: string; reports: number; unique_issues: number; duplicates_avoided: number; tickets_in_devrev: number;
  median_report_to_ticket_s: number | null; districts: DistrictCount[]; split: AgentSplit; facts: ImpactFact[];
}
export interface PlatformPart { name: string; provider: string; role: string; calls: number; errors: number; avg_ms: number; detail: string }
export interface PlatformInfo {
  as_of: string; parts: PlatformPart[]; semantic_merges: number; hosting: string; agents_mode: string; devrev_mode: string;
}
