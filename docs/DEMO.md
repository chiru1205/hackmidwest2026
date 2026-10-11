# Civic Flow: the pitch (3 minutes, no slides)

## The idea to land
**A thousand voices, one ticket, nobody left in the dark.**
Cities do not have a reporting problem. They have a *duplicate* problem (the same issue reported hundreds of times) and a *silence* problem (residents never hear back). Civic Flow fixes both: one app for any city issue, one ticket per issue, and a reply to every resident.

Three moments the room should remember (everything else serves these):
1. **The collapse.** Hundreds of reports about one flooded street fold into one issue on the map.
2. **The photo that needs no form.** A resident sends a picture; the system says "Downed tree, severity 4, hazard", picks the crew, and shows her who is coming.
3. **The loop closing.** A person clicks Approve on the laptop, the DevRev ticket closes, and **"Fixed!" lands on the phone**.

Two screens: **phone** = the resident, **laptop** = the city portal (PIN `city`) with a DevRev tab beside it. Two people if you can: one speaks, one drives.

## The script (word for word; about 330 spoken words; stage directions in brackets)

**0:00 Hook** [stand, phone in hand, laptop on the Operations map behind you; start without a slide, without "hi, we're..."]
> "Picture this. It's pouring in Kansas City, and by morning **three hundred and forty people** have reported the same flooded street. In most cities that means three hundred and forty tickets, three hundred and forty triage decisions, and three hundred and forty people who never hear anything back."
> [one-second pause]
> "We built the version where it's **one**. This is **Civic Flow**: any problem in the city, one photo from a resident, one ticket for the city, and a reply to the resident."

**0:25 Moment 1: the collapse** [click **Flooding** under "Run the story"; say nothing for two seconds while the map fills]
> "This is a simulated storm. Watch the map. Hundreds of reports... and they collapse. Not by matching coordinates: by matching **meaning**. 'Water all over the road' and 'the street is a river' are the same problem, and **Akamai's embeddings** know it. Hundreds of reports, a few dozen issues. Every one of those is a work order the city never has to triage."

**0:55 Moment 2: the photo** [phone: Report > pick the downed tree photo > Send. Do not pick a category. After Send, stop talking and let the screen work for about four seconds]
> "Now what a resident sees. No form. No dropdown. Just a photo."
> [reveal appears: "Identified: Downed tree"]
> "A downed tree, severity four, a safety hazard. **Claude on AWS Bedrock** read the photo. Agents built with **Strands**, running on **Akamai's hosted models**, checked for duplicates, ranked the urgency and picked the crew. And she sees all of it: who's coming and by when."

**1:35 Moment 3: the loop** [laptop: Workflow; the case is at the top under "New, just in". Point at the journey line. Click the Vendors tab for three seconds ("the crew's queue"), back to Workflow. Click **Start work**, **Attach after-photo**, **Request verification**]
> "On the city side it is the first thing the supervisor sees: one report, one **real DevRev ticket**. Change it in DevRev and our board follows; act here and DevRev follows. The crew sees the same job in their queue."
> [the agent line appears]
> "Now the question every city asks about AI: *what if it's wrong?* So the model is not the judge. The agent compares before and after and recommends, but **code decides what it may close**. A safety hazard like this? A person always decides. The AI can hand a case to a human. It can never overrule policy."
> [click **Approve and close**; turn the phone toward the room]
> "I approve. DevRev closes the ticket. And she gets **Fixed**."

**2:30 Proof and close** [laptop: Impact; slide the "Check our math" control once]
> "Zoom out: reports in, tickets out, work orders avoided, staff hours saved. Kansas City's real open data; the savings are labeled estimates you can change. Residents see progress, crews get clear jobs, and the city does the work **once**."
> [stop moving; look at the room]
> "Real data. Real tickets. Running right now on Akamai Cloud, reading photos with AWS, living in DevRev. **A thousand voices, one ticket, and nobody left in the dark.** Thank you."

## Delivery notes (these matter as much as the words)
- **Silence is a tool.** Let the collapse and the "Identified" reveal land before you talk. The product is doing the selling.
- **One number:** 340 becomes 1. Everything else is secondary.
- **Never apologize or say "prototype", "just", or "basically".** Say "simulated" once, plainly, for the storm.
- **Name the technology as what it *did*,** not as a logo: embeddings *matched meaning*, vision *read the photo*, agents *ranked and routed*, DevRev *holds the case*.
- **Practice the first 20 seconds and the last 15 until you can do them without looking.** The middle is driven by the screen.
- **Stretch move (only if you have rehearsed it and the room is friendly):** before you start, hand a judge the resident link and ask them to send a photo of anything broken during the pitch. It appears under "New, just in" on your screen. If the photo is not a city problem, you move on; do not rely on it.

## What each partner should hear (the depth, in one sentence)
- **Akamai:** "Matching by *meaning* is the heart of the dedup, and that is Akamai's hosted embeddings; the agents run on Akamai's hosted chat; the whole system is one Akamai Cloud server in Chicago, and the **How it's built** page shows the live call counts and latency." (Open that page in the last ten seconds if there is time.)
- **AWS:** "Claude vision on Bedrock reads every photo and checks every repair, and Strands runs the agents with a guardrail: the model can only downgrade to a person, never close what policy forbids."
- **DevRev:** "The ticket is the shared workspace for people and agents: stage, severity, the agent's verdicts on the timeline, and a two-way sync, so a change in DevRev shows up in our board within seconds."

## Why it should win (one line per category, if a judge asks)
- **Impact:** every city has the duplicate and the silence problem; the numbers are from Kansas City's open data.
- **Innovation:** matching by meaning plus an agent whose limits are enforced in code, not by the prompt.
- **Completeness:** deployed, real tickets, real data, a working loop from photo to "Fixed!".
- **Design:** one calm light interface per audience: resident, supervisor, crew, leadership.

## Before you go on stage (7:30 AM, and again right before)
1. `powershell -ExecutionPolicy Bypass -File scripts\demo_prep.ps1` (resets the data, warms the AI, prints READY or NOT READY; creates no reports or tickets). Run it twice if the first run shows any WARN.
2. Phone: open `https://172-232-2-16.sslip.io/?newuser=1`, allow location. "My requests" must be empty. Have the **downed tree** photo ready.
3. Laptop tabs in this order: Operations, Workflow, Vendors, Impact, DevRev ticket list. Sign in once with PIN `city`. Start on **Operations**.
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
| Is it only for potholes? | No: ten kinds of issues (flooding, trees, signals, streetlights, sidewalks, dumping, graffiti and more). The demo shows flooding and a downed tree. |

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
