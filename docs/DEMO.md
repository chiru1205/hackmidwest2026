# Civic Flow: the pitch (3 minutes, no slides)

**Civic Flow. Less Red Tape. More Action.**
An **AI-powered, largely autonomous** platform that connects residents, local governments (any city, town or rural municipality) and the crews doing the work. The AI handles the routine on its own (identify, prioritize, merge duplicates, route, update the resident); people decide what needs judgment.

The script below is the approved wording (your version). Lines marked **[ADDED]** are small additions for the AI/autonomy point and the sponsor mentions; delete any you do not want. **[DO: ...]** is what you do on screen; say nothing while doing it.

Two windows on one laptop (see "One device" below): **left** = the resident (phone-shaped window), **right** = the city portal (PIN `city`) with a DevRev tab beside it. Two people if you can: one speaks, one drives.

---

## [0:00-0:35 | The Hook]
**[DO: on the Operations screen press Alt+I; the opener plays (five ways a problem reaches a city fly into the logo, "Less Red Tape. More Action."). Press Space after about three seconds. Then start the Flooding storm: click "Flooding" under "Run the story" as you say the second paragraph, so the map fills with reports while you talk.]**

Imagine a storm hits your city tonight.

Trees are down. Roads are blocked. Streetlights are out.

Hundreds of residents start reporting problems. Some call city hall. Others send emails, post on social media, or contact their council members.

Now imagine being the city employee trying to make sense of all that information.

Hundreds of messages. Multiple departments. Duplicate complaints.

And one simple question: Who's actually fixing the problem?

That's the problem we're solving with Civic Flow.

## [0:35-1:15 | The Solution]
**[DO: phone window: Report, choose the downed-tree photo, Send. No category. Stop talking for three or four seconds when the screen starts working; the reveal appears.]**

Civic Flow is an AI-powered platform that connects residents, local governments, and the crews doing the work.

Here's how simple it is.

A resident sees a fallen tree blocking a road.

They take a picture and send it.
No complicated forms. No guessing which department to contact.

Our AI identifies the problem, determines its urgency, recognizes the location, and routes it to the right team.

**[ADDED]** And it does all of that on its own. Nobody sorts, tags or forwards anything. People step in only where judgment matters.

**[ADDED]** Claude on AWS Bedrock reads the photo, and agents built with Strands, running on Akamai's models, do the thinking.

And here's where it gets powerful.

## [1:15-1:55 | The Wow Moment]
**[DO: point at the Operations counters (reports in, unique issues, work orders avoided) as you say the numbers. At "It follows the entire process", switch to Workflow: the new case is at the top under "New, just in". Click Start work, Attach after-photo, Request verification.]**

Imagine 300 residents reporting the same 30 fallen trees.

Traditional systems might create 300 separate complaints.

Civic Flow recognizes that those reports describe the same incidents and combines them into 30 actionable jobs.

**[ADDED]** It matches them by meaning, not just location, using Akamai's embeddings.

That's fewer duplicates, less confusion, and faster coordination.

But Civic Flow doesn't stop when the work order is created.

It follows the entire process.

**[ADDED]** Every case is a real DevRev ticket, and it stays in sync both ways.

From the first photo to the assigned crew, from the completed repair to the final resident notification.

## [1:55-2:30 | Why It Matters]
**[DO: stay on Workflow while the agent line appears (10 to 20 seconds). At "their problem was addressed" click Approve and close, then turn the phone window toward the room: "Fixed!". At "For leadership" switch to the Impact page and drag the "Check our math" slider once.]**

**[ADDED]** While the crew's repair photo is checked by an AI agent, a person always makes the final call on anything risky.

For residents, it means transparency.

They know their voice was heard, their issue was assigned, and their problem was addressed.

For city employees, it means less time sorting through complaints and more time solving them.

For leadership, it means visibility into response times, workloads, costs, and opportunities to save money.

We're not building another complaint box.
We're building the connection between a community's problems and its solutions.

## [2:30-3:00 | The Big Finish]
**[DO: stop moving; look at the room. At the last line press Alt+I so the opener card with the tagline is on screen.]**

Think about what this could mean.

A pothole doesn't get forgotten.

A fallen tree doesn't sit unnoticed.

And a resident doesn't have to call five times just to get an answer.

Because technology shouldn't make government more complicated.
It should make government work better.

Our vision is simple:

Every problem gets heard.

Every action gets tracked.

And every resident gets an answer.

**[ADDED]** Running right now on Akamai Cloud, reading photos with AWS, living in DevRev.

Civic Flow.
Less Red Tape. More Action.

---

### Timing and fallbacks
- The storm click resets the demo data, so it must happen **before** the live photo (it does: second paragraph of the Hook).
- The narration says "30 fallen trees" while the storm on screen is flooding. It is an "imagine", so say it as written and point at the counters; if you want it to match the screen, say "30 problems".
- If you are behind at 1:55, skip the **[ADDED]** lines first.
- If the agent line is slow, keep talking; if it is not there by "problem was addressed", say nothing about it and click Approve (a person can always approve).

## The logo and the opening line
- **Logo:** a "C" that is a loop. Reports stream in from the top (the dots) and a blue check closes the loop. Files are in `docs/brand/` and live at `https://172-232-2-16.sslip.io/brand/` (`logo-mark.svg`, `logo-mark-1024.png`, `logo-horizontal.png`, `banner.png`).
- **Tagline: "Less Red Tape. More Action."** Under it on the card: "AI-powered and autonomous. Faster fixes for any city, town or rural municipality."
- **The opener card:** a short overlay on the **live Operations screen** (the map shows through, blurred), not a slide. About two seconds of animation: five ways a problem reaches a city (phone call, email, city hall, council member, social media) fly into the logo, then the tagline appears. Sign in with the PIN, then press **Alt+I** from any page; **Space**, Enter, Escape or a click dismisses it. Also at `https://city.172-232-2-16.sslip.io/ops?intro=1`.
- **Be exact about what "autonomous" means:** the AI handles intake, identification, urgency, de-duplication, routing and resident updates on its own. Crews do the repair. A case closes automatically only for low-risk cases when the agent is confident (Auto mode); a safety hazard, a school or hospital zone, a high priority or anything unsure always goes to a person.
- **Be exact about what it is:** Civic Flow is the one front door residents use, with the workflow behind it. It does not pull in phone, email or social media feeds today. Say "one front door **instead of** many", never "we collect them all".

## One device: how to run and record it (you only need the laptop)
The resident app is a web page, so it runs in a phone-shaped window next to the city portal on the same screen. Everyone in the room sees both, and one recording captures the whole demo.
1. Run `powershell -ExecutionPolicy Bypass -File scripts\demo_windows.ps1` (add `-Demo` if the laptop's location is not in Kansas City). Left window = resident, right window = city portal (sign in with PIN `city`).
2. In the resident window, "Take a photo" opens a file picker: choose the real downed-tree photo from the laptop. Say "a resident sends a photo".
3. **Backup video (silent is fine, you talk over it live):** turn on Do Not Disturb (Win+N), press **Win+Shift+R** (Snipping Tool screen recording), drag over the whole screen, Start, run the demo once, then stop. Save as `backup.mp4` on the desktop. Play it from the Photos or Media Player app. Keep it about 90 seconds; stop early rather than record the Impact page twice.
4. **Your real phone is optional:** use it only if the judges are close enough to read it, and keep it for the "Fixed!" moment. A phone's own screen recorder (iPhone: Control Center, Screen Recording; Android: swipe down, Screen recorder) works if you want a clip of it, and Clipchamp (built into Windows 11) can place the two clips side by side, but the one-screen recording above is simpler and more reliable.

## Delivery notes (these matter as much as the words)
- **Silence is a tool.** Let the collapse and the "Identified" reveal land before you talk. The product is doing the selling.
- **One sentence to repeat:** "Less Red Tape. More Action." It is on the opener card and is your last line.
- **Never apologize or say "prototype", "just", or "basically".** Say "simulated" once, plainly, for the storm.
- **Name the technology as what it *did*,** not as a logo: embeddings *matched meaning*, vision *read the photo*, agents *ranked and routed*, DevRev *holds the case*.
- **Practice the first 20 seconds and the last 15 until you can do them without looking.** The middle is driven by the screen.
- **Stretch move (only if you have rehearsed it and the room is friendly):** before you start, hand a judge the resident link and ask them to send a photo of anything broken during the pitch. It appears under "New, just in" on your screen. If the photo is not a city problem, you move on; do not rely on it.

## What each partner should hear (the depth, in one sentence)
- **Akamai:** "Matching by *meaning* is the heart of the dedup, and that is Akamai's hosted embeddings; the agents run on Akamai's hosted chat; the whole system is one Akamai Cloud server in Chicago, and the **How it's built** page shows the live call counts and latency." (Open that page in the last ten seconds if there is time.)
- **AWS:** "Claude vision on Bedrock reads every photo and checks every repair, and Strands runs the agents with a guardrail: the model can only downgrade to a person, never close what policy forbids."
- **DevRev:** "The ticket is the shared workspace for people and agents: stage, severity, the agent's verdicts on the timeline, and a two-way sync, so a change in DevRev shows up in our board within seconds."

## Why it should win (one line per category, if a judge asks)
- **Impact:** every local government that looks after roads, trees and traffic runs this broken loop; the numbers are from Kansas City's open data.
- **Innovation:** one flow from photo to fixed street, with matching by meaning and an agent whose limits are enforced in code, not by the prompt.
- **Completeness:** deployed, real tickets, real data, a working loop from photo to "Fixed!".
- **Design:** one calm light interface per audience: resident, supervisor, crew, leadership.

## Before you go on stage (7:30 AM, and again right before)
1. `powershell -ExecutionPolicy Bypass -File scripts\demo_prep.ps1` (resets the data, warms the AI, prints READY or NOT READY; creates no reports or tickets). Run it twice if the first run shows any WARN.
2. Phone: open `https://172-232-2-16.sslip.io/?newuser=1`, allow location. "My requests" must be empty. Have the **downed tree** photo ready.
3. Laptop tabs in this order: Operations, Workflow, Vendors, Impact, DevRev ticket list. Sign in once with PIN `city`, then stay on **Operations**. Press **Alt+I** to play the opener when you start speaking.
4. After the live report, do **not** press Reset or a storm button (the storm resets the data).
Live: resident `https://172-232-2-16.sslip.io/`, city `https://city.172-232-2-16.sslip.io/`.

## Real vs simulated (say it plainly if asked)
- The storm and the large report counts on Operations and Impact include **simulated** reports and are labeled so. The report from the phone is real.
- The 13 tickets on the Workflow and Vendors pages are real DevRev tickets created for the demo.
- Savings are estimates from two stated assumptions, not measured savings.
- Photo reading uses AWS vision, because Akamai's hosted models have no vision.

## Questions you may get
| Question | Answer |
|---|---|
| Why not just use 311? | 311 takes the report. It does not merge duplicates, rank urgency or tell the resident what happened. We sit in front of the city's own ticket system. |
| How does it know two reports are the same? | Distance and category first, then Akamai embeddings compare meaning when it is unclear. |
| Can the AI close a case wrongly? | Code decides what may auto-close, not the model: hazards, school or hospital zones, P1/P2, escalated, reopened or no after-photo always go to a person, and the model can only hand a case to a person. |
| Is the DevRev ticket real? | Yes. Change its stage in DevRev and the board follows within seconds. |
| What do residents see? | Only their own reports, and how many neighbors reported the same issue after they submit. |
| What does it cost to run? | One small Akamai Cloud server; AI calls are per new report, and merged duplicates add no extra model calls. |
| Is it autonomous? | For the routine, yes: it identifies the issue, ranks urgency, merges duplicates, routes it to the right crew and updates the resident on its own. People decide what needs judgment: a safety hazard, a school or hospital zone, a high-priority case or anything the agent is unsure about always goes to a person. |
| Is this for emergencies? | No. It is for non-emergency public-works issues (trees, signals, streetlights, potholes, drains, sidewalks). Emergencies still go to 911. |
| Is it only for potholes? Only for cities? | No. It covers ten kinds of public-works issues (flooding, trees, signals, streetlights, sidewalks, dumping, graffiti, potholes and more) for any local government that controls them: a city, a town or a county. Kansas City is the first deployment. |
| Could another municipality use it? | Yes. It needs that municipality's boundary, districts or wards, and crew list, which is a data step rather than new software. Today it is configured for Kansas City. |

## If something goes wrong
| Problem | Do |
|---|---|
| The reveal is slow or cannot read the photo | Wait 10 s. If it fails, type a short note ("tree across the road") and send again. |
| The new case is not in the rail | Type its ticket number (shown on the reveal, e.g. CF-1950) in "Find any case". |
| The agent line says it is unavailable | Normal after a cold start. Say "a person decides" and click Approve; it is the safe path by design. |
| Phone has no location | Tap the map to drop the pin in Kansas City, or open `/?demo=1` and pick a demo location. |
| Wi-Fi dies | Play the 90-second backup video. |
| DevRev tab is slow | Skip it; the "In DevRev" card on the Workflow page shows the same fields. |

## After the demo
Delete the Linode in Cloud Manager, rotate the Akamai, AWS and DevRev keys, and delete the test tickets in DevRev (keep TKT-1 to TKT-5, which DevRev created).
