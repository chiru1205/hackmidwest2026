# Civic Flow: demo cue cards (3 minutes, no slides)

**One line:** Civic Flow is one app for *any* city problem. Residents report with a photo; the city gets **one ticket per issue**, one crew, and the resident hears back.

Two screens. **Phone** = the resident's app. **Laptop** = the city portal (PIN `city`), with a DevRev tab open beside it.
Live: resident `https://172-232-2-16.sslip.io/`, city `https://city.172-232-2-16.sslip.io/`.

## The story in three beats (keep this order)
1. **Problem.** When something breaks in a city (a flooded street, a downed tree, a dark traffic signal, a pothole), dozens or hundreds of people report the same thing. Every duplicate costs staff time to triage, crews get sent to the same spot, and residents never hear back. Potholes are one example out of ten kinds of issues.
2. **Solution.** One app for every issue type. A photo in; the system identifies it, merges duplicates, ranks urgency, opens **one** ticket, routes the right crew, and reports back to the resident.
3. **Proof.** It runs live, on real Kansas City data, creating real tickets.

## Before you go on stage (7:30 AM, and again right before)
1. `powershell -ExecutionPolicy Bypass -File scripts\demo_prep.ps1` (resets the data, warms the AI, prints READY or NOT READY; creates no reports or tickets). Run it twice if the first run shows any WARN.
2. Phone: open `https://172-232-2-16.sslip.io/?newuser=1`, allow location. "My requests" must be empty. Have the **downed tree** photo ready.
3. Laptop tabs in this order: Operations, Workflow, Vendors, Impact, DevRev ticket list. Sign in once with PIN `city`. Start on **Operations**.
4. After the live report, do **not** press Reset or a storm button (the storm resets the data).

## The run (about 350 spoken words; say the **Say** column as written)

| Time | Screen | Do | Say |
|---|---|---|---|
| **0:00-0:30** Intro | Laptop: Operations map | Nothing yet; let the map be the backdrop. | "This is **Civic Flow**: one app for any city problem. When a street floods, a tree comes down, a signal goes dark or a pothole opens, dozens of residents report the same thing, and the city pays for it. Kansas City logged about 167,000 requests last year; roughly a quarter of pothole requests repeat an earlier one, and a typical pothole takes thirteen days to close. Residents hear nothing back. Civic Flow turns every report into **one ticket, one crew, and a reply to the resident**." |
| **0:30-1:00** Scale | Laptop: Operations | Click **Flooding** under "Run the story". Let the map fill and the counter climb. | "Here's a simulated storm: hundreds of reports about the same flooded street. We match them **by meaning, not just location, with Akamai's hosted embeddings**, so they collapse into a few dozen issues. Every duplicate is a work order the city never has to triage." |
| **1:00-1:45** Resident | Phone | Report > choose the **downed tree** photo > Send. Do not pick a category. When the reveal appears, tap **See my request**. | "Now the resident. No forms, no categories: just a photo. **Claude vision on AWS Bedrock** reads it: a downed tree, severity four, a safety hazard. Agents built with the **Strands SDK**, running on **Akamai's hosted models**, check for duplicates, score the urgency and choose the crew. She sees what we saw, who is coming and when, and only her own report." |
| **1:45-2:30** City side | Laptop: Workflow, then a quick look at Vendors, then back | Workflow: the case is under **New, just in**, already selected. Point at the journey line, then switch to the DevRev tab and back. Click the **Vendors** tab for five seconds, back to Workflow. Click **Start work**, **Attach after-photo**, **Request verification**; when the agent line appears, click **Approve and close**. Show the phone. | "On the city side it is the first thing the supervisor sees. One report, one **real DevRev ticket**, with stage, severity and timeline, synced both ways. The crew sees the same job in their queue: six crews across roads, lighting and signals, and grounds and drainage, so streetlights, trees, sidewalks and dumping, not just potholes. The crew sends an after-photo, an agent compares before and after and recommends. For a safety hazard a **person always decides**, so I approve. DevRev closes the ticket and she gets **Fixed!** on her phone." |
| **2:30-3:00** Payoff | Laptop: Impact | Scroll the funnel; drag one slider. | "And the payoff: reports in, tickets out, work orders avoided, staff hours saved. The Kansas City numbers are real open data; the savings are labeled estimates you can change. Residents see progress, crews get clear jobs, and the city does the work once. Civic Flow runs on **Akamai Cloud**, reads photos with **AWS**, and keeps every case in **DevRev**." |

If you finish early: open **How it's built** (footer of Operations) and let the judges see the live service counters.

## Make it more than potholes (what to point at)
- The live report is a **downed tree**; the storm is **flooding**; the Vendors page shows **streetlights, traffic signals, sidewalks, illegal dumping, graffiti**. Say "ten kinds of issues" once, early.
- If you have a streetlight or traffic-signal photo, use it as the *second* live report only if time allows.

## Adjust the opening for who is in the room
- **City board:** lead with cost and time ("work orders avoided, staff hours, thirteen days"), then transparency.
- **Residents:** lead with the reply ("you always know who is on it and when").
- **Partners and judges:** keep the order above; the sponsor lines are already inside the demo.

## Real vs simulated (say it plainly if asked)
- The storm and the large report counts on Operations and Impact include **simulated** reports and are labeled so. The report from the phone is real.
- The 13 tickets on the Workflow and Vendors pages are real DevRev tickets created for the demo.
- Savings are estimates from two stated assumptions, not measured savings.
- Photo reading uses AWS vision, because Akamai's hosted models have no vision.

## Questions you may get
| Question | Answer |
|---|---|
| Why not just use 311? | 311 takes the report; it does not merge duplicates, rank urgency or tell the resident what happened. We sit in front of the city's own ticket system. |
| How does it know two reports are the same? | Distance and category first, then Akamai embeddings compare meaning when it is unclear ("water all over the road" matches "street flooded"). |
| Can the AI close a case wrongly? | Code decides what may auto-close, not the model: hazards, school or hospital zones, P1/P2, escalated, reopened or no after-photo always go to a person, and the model can only hand a case to a person. |
| Is the DevRev ticket real? | Yes. Change its stage in DevRev and the board follows within seconds. |
| What do residents see? | Only their own reports and how many neighbors reported the same issue, after they submit. |
| Does it cost much to run? | One small Akamai Cloud server; AI calls are per report, and merged duplicates make no extra model calls. |

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
