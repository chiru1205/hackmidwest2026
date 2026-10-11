# Civic Flow: the pitch (3 minutes, no slides)

## The idea to land
**A thousand voices, one ticket, nobody left in the dark.**
Cities do not have a reporting problem. They have a *duplicate* problem (the same issue reported hundreds of times) and a *silence* problem (residents never hear back). Civic Flow fixes both: one app for any city issue, one ticket per issue, and a reply to every resident.

Three moments the room should remember (everything else serves these):
1. **The collapse.** Hundreds of reports about one flooded street fold into one issue on the map.
2. **The photo that needs no form.** A resident sends a picture; the system says "Downed tree, severity 4, hazard", picks the crew, and shows her who is coming.
3. **The loop closing.** A person clicks Approve on the laptop, the DevRev ticket closes, and **"Fixed!" lands on the phone**.

Two screens: **phone** = the resident, **laptop** = the city portal (PIN `city`) with a DevRev tab beside it. Two people if you can: one speaks, one drives.

## The transcript (line by line, as you would actually say it; about 340 spoken words)
**YOU** = what you say. **[DO]** = what happens on screen or in your hands (say nothing). Short lines on purpose: breathe between them.

### 0:00 The hook [phone in your hand, laptop showing the Operations map behind you]
1. **YOU:** "Picture this. It's pouring in Kansas City."
2. **YOU:** "By morning, three hundred and forty people have reported the same flooded street."
3. **YOU:** "In most cities, that's three hundred and forty tickets... and three hundred and forty people who never hear back."
4. [DO: pause for one full second]
5. **YOU:** "We built the version where it's **one**."
6. **YOU:** "This is Civic Flow. Anything that breaks in the city. One photo from a resident. One ticket for the city. And the resident actually hears back."

### 0:25 Moment 1: the collapse [laptop: Operations]
7. [DO: click **Flooding** under "Run the story"; say nothing for two seconds while the map fills]
8. **YOU:** "This is a simulated storm. Watch the map."
9. [DO: let the counter climb; the reports fold into issues]
10. **YOU:** "And they collapse. Not by matching coordinates... by matching **meaning**."
11. **YOU:** "'Water all over the road' and 'the street's a river' are the same problem. **Akamai's embeddings** know that."
12. **YOU:** "Hundreds of reports. A few dozen issues. Every duplicate is a work order the city never has to triage."

### 0:55 Moment 2: the photo [phone: hold it up so the room can see]
13. [DO: tap Report, choose the **downed tree** photo, tap Send. Do not pick a category]
14. **YOU:** "Now the resident. No form. No dropdown. Just a photo."
15. [DO: stop talking for three or four seconds while the screen works]
16. [DO: the reveal appears: "Identified: Downed tree"]
17. **YOU:** "Downed tree. Severity four. Safety hazard."
18. **YOU:** "**Claude on AWS Bedrock** read the photo. Agents built with **Strands**, running on **Akamai's models**, checked for duplicates, ranked the urgency, and picked the crew."
19. **YOU:** "And she sees all of it. Who's coming. And by when."

### 1:35 Moment 3: the loop closes [laptop: Workflow]
20. [DO: switch to Workflow; the case is at the top under "New, just in"; point at it]
21. **YOU:** "On the city side, this is the first thing the supervisor sees. One report. One **real DevRev ticket**."
22. [DO: click the DevRev tab for three seconds, then back]
23. **YOU:** "Change it there, our board follows. Act here, DevRev follows."
24. [DO: click the Vendors tab for three seconds, then back to Workflow]
25. **YOU:** "The crew sees the same job in their queue."
26. [DO: click **Start work**, then **Attach after-photo**, then **Request verification**]
27. **YOU:** "The crew's done. They send a photo."
28. [DO: wait for the agent line to appear (10 to 20 seconds); keep talking, do not stand in silence]
29. **YOU:** "Now, every city asks the same thing about AI. What if it's wrong?"
30. **YOU:** "So the model isn't the judge. The agent recommends. But **code** decides what it's allowed to close."
31. **YOU:** "A safety hazard like this? A person always decides. The AI can hand a case to a human. It can never overrule the policy."
32. [DO: click **Approve and close**; turn the phone toward the room]
33. **YOU:** "So I approve. DevRev closes the ticket. And she gets..."
34. [DO: hold the phone up; "Fixed!" shows; wait one beat]
35. **YOU:** "...Fixed."

### 2:30 The proof and the close [laptop: Impact]
36. [DO: switch to Impact; drag the "Check our math" slider once]
37. **YOU:** "Zoom out. Reports in, tickets out, work orders avoided, staff hours saved. Real Kansas City data. The savings are estimates, and you can change the assumptions."
38. **YOU:** "Residents see progress. Crews get clear jobs. And the city does the work once."
39. [DO: stop moving; look at the room]
40. **YOU:** "Real data. Real tickets. Running right now on Akamai Cloud, reading photos with AWS, living in DevRev."
41. **YOU:** "A thousand voices. One ticket. Nobody left in the dark."
42. **YOU:** "Thank you."

### Timing check
Hook 0:00 to 0:25, collapse to 0:55, photo to 1:35, loop to 2:30, close to 3:00. If you are behind at the loop, skip lines 22 to 25 (the DevRev and Vendors tab flashes) and keep the rest. If you are ahead, open **How it's built** after line 42 and say: "That's what is running underneath, live."

## One device: how to run and record it (you only need the laptop)
The resident app is a web page, so it runs in a phone-shaped window next to the city portal on the same screen. Everyone in the room sees both, and one recording captures the whole demo.
1. Run `powershell -ExecutionPolicy Bypass -File scripts\demo_windows.ps1` (add `-Demo` if the laptop's location is not in Kansas City). Left window = resident, right window = city portal (sign in with PIN `city`).
2. In the resident window, "Take a photo" opens a file picker: choose the real downed-tree photo from the laptop. Say "a resident sends a photo".
3. **Backup video (silent is fine, you talk over it live):** turn on Do Not Disturb (Win+N), press **Win+Shift+R** (Snipping Tool screen recording), drag over the whole screen, Start, run the demo once, then stop. Save as `backup.mp4` on the desktop. Play it from the Photos or Media Player app. Keep it about 90 seconds; stop early rather than record the Impact page twice.
4. **Your real phone is optional:** use it only if the judges are close enough to read it, and keep it for the "Fixed!" moment. A phone's own screen recorder (iPhone: Control Center, Screen Recording; Android: swipe down, Screen recorder) works if you want a clip of it, and Clipchamp (built into Windows 11) can place the two clips side by side, but the one-screen recording above is simpler and more reliable.

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
