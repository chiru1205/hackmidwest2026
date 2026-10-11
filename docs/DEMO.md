# Civic Flow: demo cue cards (3 minutes, no slides)

Two screens. **Phone** = the citizen app. **Laptop** = the city portal (PIN `city`), with a DevRev tab open beside it.
Live site: citizen `https://172-232-2-16.sslip.io/`, city `https://city.172-232-2-16.sslip.io/`.

## Before you go on stage (7:30 AM, then again right before)
1. `powershell -ExecutionPolicy Bypass -File scripts\demo_prep.ps1`  (resets the data, warms up the AI, prints READY or NOT READY). It creates no reports or tickets. Run it **twice** if the first run shows any WARN.
2. Phone: open `https://172-232-2-16.sslip.io/?newuser=1`. Allow location. "My requests" must be empty.
3. Laptop tabs, in this order: Operations, Workflow, Vendors, Impact, the DevRev ticket list. Sign in once with PIN `city`.
4. Phone photos ready in the gallery, in demo order: downed tree (the live report), then the after-photo pair if you have one.
5. Do **not** press Reset or the storm buttons after the live report; the storm resets the data.

## The run (what you do, what you say)

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00-0:25 | Laptop: Operations | Click **Flooding** under "Run the story". Let the map fill. | "Kansas City gets about 167,000 service requests a year, and about 28% of pothole requests repeat an earlier one. One storm means hundreds of reports about the same flooded street. Watch them collapse into a few dozen issues. Every duplicate that would have been its own work order is counted here." |
| 0:25-1:15 | Phone | Report > choose the **downed tree** photo > Send. Do not pick a category. | "The citizen doesn't choose a category or a severity. They send a photo. Claude vision on AWS Bedrock reads it, and agents on Akamai's hosted models decide whether it's a duplicate, how urgent it is, and which crew it goes to." (the reveal shows *Identified: Downed tree*, severity, priority, crew, due date) "She sees what we saw, who's on it, and when. Nobody else's reports, only hers." Tap **See my request**. |
| 1:15-1:45 | Laptop: Workflow | The case is at the top under **New, just in** (selected already). Walk the journey line left to right. Switch to the DevRev tab and show the same ticket. | "One report becomes one real DevRev ticket, with the severity, the stage and the timeline. Change it in DevRev and our board follows in seconds; act here and DevRev follows." |
| 1:45-2:25 | Laptop: Workflow | Click **Start work**. **Attach after-photo**, **Request verification**. Wait about 10-20 s for the agent line. Then **Approve and close**. Back to the phone. | "The crew says it's fixed with a photo. An agent compares before and after and tells the supervisor what it thinks. For a safety hazard like this, a person always decides, so I approve. The ticket closes in DevRev, and she gets **Fixed!** on her phone. For low-risk cases the agent can close it on its own at high confidence, and every decision is on the DevRev timeline." |
| 2:25-2:50 | Laptop: Impact | Scroll the funnel, drag the "Check our math" slider. | "Reports in, tickets out, work orders avoided, staff hours and dollars. The real numbers come from KC's open data; the savings are labeled estimates, and you can change the assumptions." |
| 2:50-3:00 | Laptop | Open **How it's built** (footer of Operations) if there is time. | "Akamai Cloud runs the whole thing in Chicago, with hosted embeddings for matching and hosted chat for the agents. AWS Bedrock reads the photos, Strands runs the agents, and DevRev is the city's system of record." |

## Real vs simulated (say this if asked)
- The storm and the 1,000+ report counts on Operations and Impact include **simulated** demo reports and are labeled so. The live report from the phone is real.
- The 13 tickets on the Workflow and Vendors pages are real DevRev tickets created for the demo.
- Savings figures are estimates from two stated assumptions, not measured savings.
- Photo reading uses AWS vision. Akamai's hosted models have no vision.

## If something goes wrong
| Problem | Do |
|---|---|
| The reveal is slow or says it couldn't read the photo | Wait 10 s. If it fails, type a short note ("tree across the road") and send again; the note alone identifies the issue. |
| The new case is not in the rail | Type its ticket number (from the reveal, e.g. CF-1950) in "Find any case". |
| The agent line says "check unavailable" | Normal after a cold start. Say "a person decides" and click Approve; it is the safe path by design. |
| Phone has no location | Tap the map to drop the pin in Kansas City, or open `/?demo=1` and pick a demo location. |
| Wi-Fi dies | Play the 90-second backup video. |
| DevRev tab is slow | Skip the DevRev tab; the Workflow page's "In DevRev" card shows the same fields. |

## Sponsor lines (one sentence each)
- **Akamai:** "The system runs on Akamai Cloud in Chicago; duplicate matching uses Akamai hosted embeddings, and the agents run on Akamai hosted chat."
- **AWS:** "Claude vision on Amazon Bedrock reads every photo, and the agents are built with the Strands SDK."
- **DevRev:** "Every issue is a real DevRev ticket; stages, severity and the timeline sync both ways."

## After the demo
Delete the Linode in Cloud Manager, rotate the Akamai, AWS and DevRev keys, and delete the test tickets in DevRev (keep TKT-1 to TKT-5, which DevRev created).
