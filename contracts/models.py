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
