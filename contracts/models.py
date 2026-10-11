"""Civic Flow shared data shapes. Single source of truth for backend, agents and frontend.

Change only with all three layers' owners agreeing. contracts/types.ts mirrors this file.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Category = Literal[
    "pothole", "streetlight_out", "traffic_signal", "sidewalk_damage", "manhole_cover",
    "road_debris", "graffiti", "illegal_dumping", "downed_tree", "flooding", "other",
]
ClusterStatus = Literal["reported", "assigned", "in_progress", "fixed"]
TicketStage = Literal["queued", "work_in_progress", "resolved", "canceled"]
TicketSeverity = Literal["blocker", "high", "medium", "low"]
Bucket = Literal["P1", "P2", "P3", "P4"]
ReportKind = Literal["first", "confirm", "photo_confirm"]
Outcome = Literal["created", "merged", "rejected"]
EventType = Literal[
    "report.received", "cluster.created", "cluster.merged", "cluster.updated",
    "agent.node", "ticket.created", "ticket.updated", "stats.updated",
    "simulate.progress", "reset",
]


class Triage(BaseModel):
    """Result of reading a photo (VISION=on) or of the category chips + note (VISION=off)."""
    is_valid: bool = True
    invalid_reason: Optional[str] = None
    category: Category = "pothole"
    severity: int = Field(3, ge=1, le=5)
    is_safety_hazard: bool = False
    hazard_description: str = ""
    confidence: float = 0.5


class EdgeInfo(BaseModel):
    hit: bool
    ms: float
    cell: str = ""  # geohash cell used as the edge cache key


class Ticket(BaseModel):
    """DevRev-shaped ticket. Stored by the mock ticket board (DEVREV_MODE=mock)."""
    id: str                      # e.g. "CF-1042"
    cluster_id: str
    title: str
    body: str
    severity: TicketSeverity
    stage: TicketStage = "queued"
    vendor: Optional[str] = None
    tags: list[str] = []
    created_at: str              # ISO 8601 UTC
    updated_at: str


class Cluster(BaseModel):
    id: str
    category: Category
    lat: float
    lng: float
    status: ClusterStatus = "reported"
    severity: int = Field(3, ge=1, le=5)
    is_hazard: bool = False
    hazard_description: str = ""
    reporter_count: int = 1      # unique reporters
    report_count: int = 1
    priority: float = 0.0        # 0..100
    bucket: Bucket = "P4"
    rationale: str = ""          # agent-written explanation of the priority
    location_crit: float = 0.2   # 0..1 (school zone 1.0, arterial 0.8, residential 0.2)
    neighborhood: Optional[str] = None
    district: Optional[str] = None      # KCMO council district, e.g. "District 4"
    zones: list[str] = []               # priority zones the spot is inside, e.g. "School zone: Westport Elementary"
    address: Optional[str] = None
    photo_url: Optional[str] = None
    ticket_id: Optional[str] = None
    vendor: Optional[str] = None
    simulated: bool = False
    first_reported_at: str
    last_reported_at: str
    fixed_at: Optional[str] = None


class Report(BaseModel):
    id: str
    cluster_id: str
    user_id: str
    lat: float
    lng: float
    accuracy_m: float = 20.0
    category: Category
    note: str = ""
    photo_url: Optional[str] = None
    phash: Optional[str] = None
    kind: ReportKind = "first"
    simulated: bool = False
    created_at: str


class AgentStep(BaseModel):
    node: Literal["intake", "dedup", "judge", "priority", "dispatch"]
    status: Literal["start", "done", "skipped", "error"]
    ms: float = 0.0
    summary: str = ""
    model: Optional[str] = None


class ReportResult(BaseModel):
    outcome: Outcome
    message: str                         # friendly sentence for the citizen
    report_id: Optional[str] = None
    cluster: Optional[Cluster] = None
    neighbors: int = 0                   # unique reporters on the cluster, including you
    points_awarded: int = 0
    xp_total: int = 0
    level: str = "Resident"
    priority_before: Optional[float] = None
    priority_after: Optional[float] = None
    ticket: Optional[Ticket] = None
    edge: Optional[EdgeInfo] = None
    reject_reason: Optional[str] = None
    steps: list[AgentStep] = []
    my_photo_url: Optional[str] = None   # the caller's own uploaded photo for this report, if any


class NearbyResult(BaseModel):
    clusters: list[Cluster]
    edge: EdgeInfo


class TimelineEntry(BaseModel):
    ts: str
    label: str
    detail: str = ""


class ClusterDetail(BaseModel):
    cluster: Cluster
    ticket: Optional[Ticket] = None
    reports: list[Report] = []           # newest first, max 20
    timeline: list[TimelineEntry] = []
    agent_trace: list[AgentStep] = []


class Badge(BaseModel):
    id: str
    name: str
    description: str
    earned: bool = False


class Profile(BaseModel):
    user_id: str
    name: str
    neighborhood: str = "Downtown"
    xp: int = 0
    level: str = "Resident"
    next_level_xp: int = 250
    streak_weeks: int = 0
    reports: int = 0
    confirmations: int = 0
    fixed: int = 0
    badges: list[Badge] = []


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    xp: int
    reports: int
    neighborhood: str = ""
    is_you: bool = False


class Stats(BaseModel):
    total_reports: int = 0
    unique_clusters: int = 0
    duplicates_absorbed: int = 0
    llm_calls_avoided: int = 0
    open_clusters: int = 0
    fixed_clusters: int = 0
    tickets: int = 0
    edge_hits: int = 0
    edge_misses: int = 0
    avg_edge_ms: float = 0.0


class Event(BaseModel):
    id: int
    type: EventType
    ts: str
    data: dict[str, Any] = {}


class Flags(BaseModel):
    model_provider: str = "akamai"
    agents_mode: Literal["graph", "det"] = "det"
    vision: bool = False
    devrev_mode: Literal["mock", "live"] = "mock"
    storage: Literal["local", "s3"] = "local"
    edgekv_backend: Literal["memory", "valkey", "edge"] = "memory"
    demo_mode: bool = False


class SimulateRequest(BaseModel):
    count: int = 200
    lat: float = 39.0420
    lng: float = -94.5950
    spread_m: float = 8.0
    category: Category = "pothole"
    users: int = 120
    rate_per_s: float = 25.0


class VendorOrder(BaseModel):
    cluster: Cluster
    ticket: Optional[Ticket] = None
    due: str = ""


class Health(BaseModel):
    status: str = "ok"
    flags: Flags
    services: dict[str, str] = {}        # name -> "ok" | "mock" | "off" | "error: ..."


class CategorySuggestion(BaseModel):
    """GET /api/suggest?text=..."""
    category: Category = "other"
    confidence: float = 0.0
    source: Literal["akamai-embedding", "keywords"] = "keywords"


class AIModelUsage(BaseModel):
    name: str
    provider: str
    calls: int = 0
    errors: int = 0
    avg_ms: int = 0
    last_ms: int = 0
    tokens: Optional[int] = None


class AIUsage(BaseModel):
    """GET /api/ai-usage"""
    models: list[AIModelUsage] = []
    since: str = ""


class ZoneHit(BaseModel):
    """One priority zone containing a point (GET /api/geofence)."""
    type: Literal["school", "hospital", "arterial"]
    name: str
    distance_m: int
    radius_m: int
    boost: float


class GeoInfo(BaseModel):
    """GET /api/geofence?lat=&lng="""
    in_service_area: bool
    neighborhood: Optional[str] = None
    district: Optional[str] = None
    zones: list[ZoneHit] = []
    message: Optional[str] = None        # friendly sentence when outside the service area


# ---- DevRev case-flow board (GET /api/devrev/board, /ticket/{id}/journey, POST /ticket/{id}/action, GET /events)
StageKey = Literal["queued", "assigned", "in_progress", "awaiting_verification", "resolved"]


class BoardTicket(BaseModel):
    id: str                              # "CF-1063"
    devrev_id: Optional[str] = None      # "TKT-21"
    title: str
    cluster_id: str
    stage_key: StageKey
    severity: TicketSeverity
    priority_bucket: Bucket
    vendor: Optional[str] = None
    owner: Optional[str] = None
    neighborhood: Optional[str] = None
    district: Optional[str] = None
    zones: list[str] = []
    reporters: int = 1
    age_s: float = 0.0
    due: Optional[str] = None
    overdue: bool = False
    escalated: bool = False
    evidence_count: int = 0
    web_url: Optional[str] = None


class BoardStage(BaseModel):
    key: StageKey
    label: str
    count: int = 0
    avg_age_s: Optional[float] = None
    tickets: list[BoardTicket] = []


class BoardTotals(BaseModel):
    open: int = 0
    overdue: int = 0
    escalated: int = 0
    resolved: int = 0
    median_ttr: Optional[str] = None
    unsynced: int = 0  # local issues not mirrored to DevRev


class Board(BaseModel):
    source: Literal["devrev", "local board"]
    as_of: str
    stages: list[BoardStage] = []
    totals: BoardTotals = BoardTotals()


class JourneyStep(BaseModel):
    ts: str
    source: Literal["civicflow", "devrev", "agent"]
    kind: Literal["report", "vision", "geofence", "dedup", "priority", "routing", "created", "stage", "comment",
                  "escalated", "verification", "resolved", "reopened"]
    title: str
    detail: str = ""


class Journey(BaseModel):
    ticket: BoardTicket
    steps: list[JourneyStep] = []


class TicketAction(BaseModel):
    action: Literal["start", "request_verification", "approve", "escalate", "reopen"]
    note: Optional[str] = None


class TicketActionResult(BaseModel):
    ok: bool
    ticket: Optional[BoardTicket] = None
    error: Optional[str] = None


class TicketEventRow(BaseModel):
    ts: str
    kind: Literal["created", "stage", "comment", "escalated", "verification", "resolved", "reopened"]
    ticket_id: str
    devrev_id: Optional[str] = None
    text: str
    source: Literal["DevRev", "Civic Flow", "Agent"]


# ---- Workflow page "case journey": GET /api/devrev/cases, GET /api/devrev/ticket/{id}/case
class CaseCounts(BaseModel):
    open: int = 0            # all open (not resolved) cases
    new: int = 0             # reported in the last 10 minutes (just in)
    approval: int = 0        # stage awaiting_verification: the crew says fixed, a person must approve
    overdue: int = 0         # past due and not resolved
    escalated: int = 0       # escalated and not resolved
    no_crew: int = 0         # queued with no crew for more than 24 h
    needs_you: int = 0       # distinct cases in any of the four groups above
    agent_closed: int = 0    # cases the agent verified and closed on its own (all time, from the event log)


class CaseRow(BoardTicket):
    reasons: list[Literal["new", "approval", "overdue", "escalated", "no_crew"]] = []   # why this case needs a person


class CaseList(BaseModel):
    source: Literal["devrev", "local board"]
    as_of: str
    total: int               # rows matching the filter (not just this page)
    counts: CaseCounts       # always for the whole board, ignoring q/group
    items: list[CaseRow] = []
    semantic: bool = False   # True when meaning-based ranking added matches to the plain text search for q


class FactorBar(BaseModel):
    label: str               # "Severity", "Neighbors reporting", "Safety hazard", "Location"
    value: str               # "4 of 5", "211", "Yes", "Arterial corridor"
    pct: float = 0.0         # 0-100, the bar fill


class DevrevRecord(BaseModel):
    """Only fields that really exist on the DevRev ticket (works.get)."""
    display_id: Optional[str] = None     # "TKT-8"
    stage: Optional[str] = None          # DevRev's own stage name, e.g. "work_in_progress"
    severity: Optional[str] = None
    part: Optional[str] = None           # applies_to_part, e.g. "PROD-1"
    owner: Optional[str] = None          # e.g. "DEVU-3"
    external_ref: Optional[str] = None   # our cluster id
    web_url: Optional[str] = None        # "Open in DevRev" (None when DEVREV_WEB_BASE is not set)
    synced: bool = False                 # False for local-only tickets that are not mirrored


class Station(BaseModel):
    key: Literal["reported", "understood", "ticket", "crew", "verify", "told"]
    title: str
    detail: str
    state: Literal["done", "now", "todo"]
    chip: str                            # e.g. "Civic Flow", "Bedrock + Akamai AI", "DevRev - TKT-8"
    chip_source: Literal["civicflow", "devrev", "agent"]
    ts: Optional[str] = None             # when it happened (None for todo)


class CaseDetail(BaseModel):
    ticket: BoardTicket
    category: str
    address: Optional[str] = None
    before_photo_url: Optional[str] = None
    after_photo_url: Optional[str] = None            # the crew's fix photo, when one exists
    crew_note: Optional[str] = None                  # the latest verification/comment note from the crew
    priority_score: float = 0.0                      # 0-100
    rationale: str = ""
    factors: list[FactorBar] = []
    duplicates_avoided: int = 0                      # reporters - 1
    devrev: DevrevRecord = DevrevRecord()
    stations: list[Station] = []
    timeline: list[JourneyStep] = []                 # the existing journey steps, newest last
    can: list[Literal["start", "request_verification", "approve", "escalate", "reopen"]] = []  # actions allowed now
    agent: Optional["AgentVerdict"] = None   # None until a fix check has run for this case


# ---- agentic fix verification: an agent compares before/after photos (vision), a hosted chat agent decides, code enforces policy
class AgentVerdict(BaseModel):
    state: Literal["none", "checking", "recommends_approve", "recommends_review", "auto_approved", "skipped"] = "none"
    decision: Optional[Literal["approve", "review"]] = None
    confidence: float = 0.0              # 0-1
    reason: str = ""                     # one sentence from the decision agent
    observation: str = ""                # what the vision model saw in the before/after photos (1-2 sentences)
    policy_note: str = ""                # why a person is still needed, or why auto-approval was allowed
    checked_at: Optional[str] = None
    eyes: str = "AWS Bedrock vision"     # which model read the photos
    brain: str = "Akamai hosted chat"    # which model made the decision


class AutonomyPolicy(BaseModel):
    """GET /api/devrev/autonomy (staff). POST /api/devrev/autonomy {mode} changes the mode only."""
    mode: Literal["off", "suggest", "auto"] = "suggest"   # off: no check; suggest: recommend only; auto: may close low-risk cases
    auto_buckets: list[Bucket] = ["P3", "P4"]
    min_confidence: float = 0.85
    always_human: list[str] = []         # plain-language rules that always need a person
    closed_by_agent: int = 0
    recommended: int = 0


# ---- Impact page (staff): GET /api/impact/live, and the judges' page GET /api/platform
class DistrictCount(BaseModel):
    label: str
    duplicates: int = 0


class AgentSplit(BaseModel):
    closed_by_agent: int = 0
    on_track: int = 0                    # open and moving with a crew, nothing needed from a person
    needs_person: int = 0
    total: int = 0


class ImpactFact(BaseModel):
    label: str
    value: str
    note: str = ""
    estimate: bool = False
    source: str = ""


class ImpactLive(BaseModel):
    as_of: str
    reports: int = 0                     # total reports received
    unique_issues: int = 0               # clusters
    duplicates_avoided: int = 0          # reports - unique issues
    tickets_in_devrev: int = 0
    median_report_to_ticket_s: Optional[float] = None
    districts: list[DistrictCount] = []  # duplicates absorbed per council district, largest first
    split: AgentSplit = AgentSplit()
    facts: list[ImpactFact] = []         # the real Kansas City open-data facts (same content as GET /api/impact)


class PlatformPart(BaseModel):
    name: str                            # e.g. "Hosted embeddings"
    provider: str                        # "Akamai", "AWS", "DevRev", ...
    role: str                            # one line: what it does here
    calls: int = 0
    errors: int = 0
    avg_ms: int = 0
    detail: str = ""


class PlatformInfo(BaseModel):
    as_of: str
    parts: list[PlatformPart] = []
    semantic_merges: int = 0             # reports merged by embedding similarity that distance alone would not have merged
    hosting: str = ""                    # e.g. "Akamai Cloud (Linode), Chicago"
    agents_mode: str = ""
    devrev_mode: str = ""


# ---- citizen app (GET /api/me/requests): one citizen's view of an issue they reported or confirmed
class CitizenTimelineItem(BaseModel):
    ts: str
    label: str
    detail: str = ""


class CitizenDetected(BaseModel):
    category: Category
    severity: int = 3
    is_hazard: bool = False
    hazard_description: str = ""


class CitizenRequest(BaseModel):
    id: str                                  # cluster id
    category: Category
    title: str                               # "Streetlight out near 5201 Charlotte St"
    address: Optional[str] = None
    neighborhood: Optional[str] = None
    district: Optional[str] = None
    zones: list[str] = []
    photo_url: Optional[str] = None          # the caller's own photo when they have one, else the issue photo
    my_photo_url: Optional[str] = None
    issue_photo_url: Optional[str] = None    # the issue's original photo
    neighbors: int = 1                       # unique reporters on the issue, including you
    status: Literal["reported", "assigned", "in_progress", "awaiting_verification", "fixed"] = "reported"
    stage_label: str = "Reported"
    ticket_id: Optional[str] = None
    crew: Optional[str] = None
    due: Optional[str] = None
    priority_bucket: Bucket = "P4"
    rationale: str = ""
    detected: CitizenDetected
    my_points: int = 0
    created_at: str
    updated_at: str
    timeline: list[CitizenTimelineItem] = []
    # what the caller themselves reported on this issue (additive)
    my_note: Optional[str] = None
    my_category: Optional[Category] = None   # category stored with the caller's report (the server may have replaced the one they picked with what the photo showed)
    my_severity: Optional[int] = None
    my_reported_at: Optional[str] = None
