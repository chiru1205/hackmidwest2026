import { useState } from "react";
import { Camera, MapPin, Plus, Radar, Trash2 } from "lucide-react";
import { Page } from "./Page";
import {
  AnimatedNumber, Avatar, AvatarStack, Button, Card, Divider, EmptyState, ErrorState, IconButton, Kbd, LineStepper,
  Pill, PriorityBadge, ProgressBar, ProgressRing, SectionHeader, SegmentedControl, Sheet, Skeleton, Stat, StatusBadge, TicketId, Tooltip, useToast,
} from "../ui";

/** Dev-only styleguide at /__kit. Shows every shared component. */
export default function Kit() {
  const [seg, setSeg] = useState("map");
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  return (
    <Page width="default">
      <SectionHeader level={1} eyebrow="Design kit" title="Every component, one place" description="Tokens and primitives shared by Citizen, Ops, Vendor and Workflow." />
      <Card padding="lg" className="kit-grid">
        <div className="kit-row">
          <Button icon={<Camera />}>Report</Button>
          <Button variant="secondary" icon={<MapPin />}>Locate</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<Trash2 />}>Delete</Button>
          <Button loading>Saving</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" iconRight={<Plus />}>Large</Button>
          <IconButton icon={<Radar />} label="Radar" variant="secondary" />
          <Tooltip label="Tooltip-lite"><IconButton icon={<Plus />} label="Add" variant="primary" /></Tooltip>
        </div>
        <div className="kit-row">
          <PriorityBadge bucket="P1" score={92} solid /><PriorityBadge bucket="P2" score={74} /><PriorityBadge bucket="P3" score={51} /><PriorityBadge bucket="P4" score={12} />
          <StatusBadge status="reported" /><StatusBadge status="assigned" /><StatusBadge status="in_progress" /><StatusBadge status="fixed" />
          <TicketId id="CF-1042" /><Pill variant="outline">Outline</Pill><Pill variant="hazard" dot="pulse">Live</Pill>
        </div>
        <div className="kit-row"><SegmentedControl value={seg} onChange={setSeg} options={[{ value: "map", label: "Map" }, { value: "list", label: "List", count: 24 }, { value: "feed", label: "Feed" }]} /></div>
        <div className="kit-row" style={{ alignItems: "flex-end" }}>
          <Stat label="Reports" value={1442} size="lg" /><Stat label="P1 open" value={7} tone="P1" /><Stat label="Fixed" value={118} tone="success" />
          <Stat label="Avg cache" value={0.2} decimals={1} suffix=" ms" /><AnimatedNumber value={211} className="t-display xl" />
        </div>
        <div className="kit-row">
          <Avatar name="Ana Ruiz" /><Avatar name="Dev Patel" /><AvatarStack names={["Ana Ruiz", "Dev Patel", "Sam Lee", "Jo K", "Mia T"]} total={211} />
          <ProgressRing value={620} max={1000} size={96}><span className="t-num">620</span></ProgressRing>
          <div style={{ width: 220 }}><ProgressBar value={72} /><div style={{ height: 8 }} /><ProgressBar value={40} tone="P2" /></div>
          <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
        </div>
        <div style={{ maxWidth: 420 }}><LineStepper status="in_progress" /></div>
        <Divider label="States" />
        <div className="kit-cols">
          <Skeleton n={2} h={56} />
          <EmptyState title="No reports yet" description="Snap a pothole and it shows up here." action={<Button size="sm" icon={<Camera />}>Report one</Button>} compact />
          <ErrorState message="Could not reach the API." onRetry={() => {}} compact />
        </div>
        <div className="kit-row">
          <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="secondary" onClick={() => toast("Report received", 50)}>Toast</Button>
        </div>
      </Card>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet" side="bottom"><p className="t-body">Bottom sheet on phones, pass side="right" for a desktop drawer.</p></Sheet>
    </Page>
  );
}
