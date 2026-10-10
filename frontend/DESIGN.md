# Civic Flow design system

Concept: **a transit map for the city.** Reports are dots that converge along lines into one ticket. Use lines, stations (rounded nodes), route-like connectors, calm navy and one signal blue. Live preview of every component: run the dev server and open `/__kit`.

## Rules of thumb
- One accent per view (signal blue `--primary`) plus the priority/status colours. Hazard orange `--hazard` only for the thing that is wrong (pothole pin, "edge miss").
- Cards are white surfaces with soft layered shadows and a hairline. No heavy borders, no outlines on every box.
- Spacing is a 4/8 scale. Radius: cards 16, inputs/buttons 12, pills 999.
- Never hard-code colours. Use tokens so light/dark both work.
- Icons: `lucide-react`, stroke 1.75 (the shared components already set this). No emoji as UI.
- Motion: framer-motion springs from `components/ui` (`spring.soft|snappy|pop|slow`, `list`/`item` stagger variants). Everything respects reduced motion (`<MotionConfig reducedMotion="user">` is on at the app root; CSS has a global rule).

## Themes
`data-theme="light|dark"` on a wrapper switches every token. The app shell sets it by route: Citizen and Vendor are light, Ops and Workflow are dark (`SECTION_THEME` in `App.tsx`). Override a subtree with `<ThemeScope theme="dark">` or `<Page theme="dark">`. Portals (Sheet) re-apply the theme automatically. If you add a portal of your own, wrap it in `<div data-theme={useTheme()}>`.

## Tokens (`src/styles/tokens.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F4F6FA | #0A1322 | page |
| `--surface` / `--surface-2` / `--surface-3` | #FFF / #F8FAFD / #EEF2F8 | #111D33 / #14233B / #1A2B47 | cards / subtle fill / tracks, pressed |
| `--line` / `--line-strong` | #E3E8F0 / #CDD6E3 | #1F2C45 / #2C3D5E | hairlines / input borders |
| `--text` / `--muted` / `--faint` | #0B1B33 / #5B6B85 / #8A97AD | #E8EEF8 / #8FA0BC / #62738F | text levels |
| `--primary` `--primary-hover` `--primary-text` `--on-primary` | #2457FF ... | #3F6CFF ... | actions, links, selected. Use `--primary-text` for blue text |
| `--p1` `--p2` `--p3` `--p4` | #E5484D #F97316 #F5B301 #8A97AD | same | priority fills, map pins. `--pN-ink` = readable text colour on tinted bg |
| `--success` `--success-ink` | #12B981 | | fixed |
| `--hazard` | #FF5B2E | | the problem itself |
| `--glass` `--glass-line` | translucent white | translucent navy | panels over maps (add `backdrop-filter: blur(18px)` or use `<Card tone="glass">`) |
| `--navy` | #0B1B33 | | brand navy, always |
| `--shadow-1/2/3` | soft, layered | heavier | resting / card / overlay |
| `--ring` | focus glow | | inputs |
| `--s-1..s-20` | 4 8 12 16 20 24 32 40 48 64 80 | | spacing |
| `--r-xs..r-xl`, `--r-pill` | 6 8 12 16 24 999 | | radius |
| `--ease-out`, `--ease-spring`, `--dur-1/2/3` | | | CSS motion |
| `--header-h` | 60 (56 phone) | | `calc(100dvh - var(--header-h))` for full-height screens |

Legacy aliases still exist (`--paper --ink --signal --teal --amber --alert --xp ...`) so old screens work. Do not use them in new code.

## Type (`src/styles/base.css`)
Fonts are self-hosted (`@fontsource-variable`): `--font-display` Bricolage Grotesque (headings, big numbers), `--font-ui` Inter, `--font-mono` JetBrains Mono (ticket ids, numbers in tables).
Scale: 12 / 14 / 16 / 20 / 28 / 40 / 64 (`--fs-12` ... `--fs-64`).

| Class | Look |
|---|---|
| `.t-display` (+ `.xl` = 64px) | 40px, tight tracking, hero numbers and titles |
| `.t-heading` | 28px page headings |
| `.t-title` | 20px card/section titles |
| `.t-body` (+ `.lg`) | 14px (16px) body |
| `.t-caption` | 12px muted |
| `.t-eyebrow` | 12px uppercase tracked label |
| `.t-mono` | JetBrains Mono for ids |
| `.t-num` | display font, tabular numerals, tight tracking: every counter |

## Layout
```tsx
import { Page } from "../components/shell/Page";
<Page width="default">...</Page>           // 480 / 1040 / 1360 / full, gutters + vertical rhythm
<Page width="full" fill>...</Page>         // exactly the viewport below the header, no scroll (ops map)
<Page bleed>...</Page>                     // no padding
```
The header is rendered once by `App.tsx`; **screens must not render their own header**. The old `Header` export is a no-op. Routes: `/` `/mine` `/profile` (Citizen), `/ops`, `/vendor`, `/workflow`.

## Components (`import { ... } from "../components/ui"`)

```tsx
<Button icon={<Camera />} loading={busy} onClick={go}>Report</Button>        // primary|secondary|ghost|danger, size sm|md|lg, block
<a className={buttonClass("secondary", "sm")} href="...">Link as button</a>
<IconButton icon={<X />} label="Close" variant="ghost|secondary|primary|glass" />

<PriorityBadge bucket="P1" score={92} />            // P1-P4, optional numeric score
<StatusBadge status="in_progress" />                // reported / assigned / in_progress / fixed
<Pill variant="success" dot="pulse" size="sm">Edge hit</Pill>   // also P1-P4, status, neutral, primary, outline, hazard
<TicketId id="CF-1042" />

<Card padding="md|sm|lg|none" tone="default|flat|subtle|glass" interactive selected as="button">...</Card>
<SectionHeader level={1|2|3} eyebrow="Ops" title="..." description="..." action={<Button/>} />
<Divider label="or" />   <Kbd>K</Kbd>

<Stat label="Reports" value={1442} size="sm|md|lg" tone="P1|success|primary|hazard" hint="+12 today" />
<AnimatedNumber value={211} className="t-display xl" />     // spring-eased tabular counter
useCountUp(target, ms)                                       // raw hook

<SegmentedControl value={v} onChange={setV} options={[{ value: "map", label: "Map", icon, count }]} />
<Avatar name="Ana Ruiz" size={32} />   <AvatarStack names={[...]} total={211} max={4} />
<ProgressBar value={72} tone="P2" />   <ProgressRing value={620} max={1000} size={120}>{center}</ProgressRing>
<LineStepper status="in_progress" />                         // transit-line status tracker (Reported > Assigned > In progress > Fixed)

<Skeleton height={120} />  <Skeleton circle height={40} />  <Skeleton n={3} h={72} />  <SkeletonText lines={3} />
<EmptyState icon={<Inbox />} title="No reports yet" description="..." action={<Button/>} compact />
<ErrorState message={err} onRetry={reload} />

<Tooltip label="Copy id"><IconButton .../></Tooltip>
<Popover trigger={({ toggle, ref, ...aria }) => <IconButton ref={ref} onClick={toggle} {...aria} .../>}>{(close) => ...}</Popover>
<Sheet open={open} onClose={close} title="Report" side="bottom|right" footer={...}>...</Sheet>   // bottom sheet on phones, drawer with side="right"

const toast = useToast();  toast("Report received", 50);     // second arg = XP chip
```
Motion helpers: `spring`, and stagger variants `list` / `item` / `fadeUp` / `pop`:
```tsx
<motion.ul variants={list} initial="hidden" animate="show"><motion.li variants={item} /></motion.ul>
```
Hooks: `useReducedMotion()`, `useCountUp()`, `useMediaQuery("(max-width: 640px)")`, `useTheme()`.

Legacy exports kept so existing screens work: `BucketChip, TicketChip, EdgeChip, ErrorBox, Empty, PriorityBar, LineStepper, Skeleton, ToastProvider, useToast, fixedColor`, plus `MiniMap` and the old class names in `styles/legacy.css`. Delete a rule from `legacy.css` once your screen no longer needs it.

## Patterns
- **Glass over map** (ops): `<Card tone="glass" padding="sm">` or `background: var(--glass); backdrop-filter: blur(18px); box-shadow: var(--shadow-3), 0 0 0 1px var(--glass-line)`. Keep panels out of the way of pins.
- **Photo**: `<img>` with `object-fit: cover; border-radius: var(--r-md)` on a `<Skeleton>` background until `onLoad`.
- **Touch targets**: buttons, icon buttons and segmented options are 44px on coarse pointers automatically.
- **Map colours**: pins use `--p1..--p4` and `--success`. `lib/const.ts` BUCKET_COLOR still has the old hexes; map code should read the CSS vars or use P1 #E5484D, P2 #F97316, P3 #F5B301, P4 #8A97AD, fixed #12B981.
- **Status line**: dots and a connecting line are the brand. Reuse `<LineStepper>` or draw route connectors with a 4px rounded line in `--primary` and 26px station dots.
