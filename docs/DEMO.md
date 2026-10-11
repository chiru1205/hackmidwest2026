# Civic Flow: the pitch (3 minutes, no slides)

## The idea to land
**Every fix starts here.**
Problems reach a local government (city, town, county) through disconnected channels: phone calls, the front desk, a council member's email, social media. Each one is retyped, passed on and lost, so the crew finds out days later and the resident never hears back. Civic Flow is the **front door and the whole workflow behind it**: it understands the report, works out whose job and how urgent it is, merges the duplicates, opens one ticket, routes the crew, verifies the fix, tells the resident, and shows leadership what it all costs and saves.

Merging duplicates is **one** step of that loop, not the product. Say so: it is the part that shows at scale.

Three moments the room should remember (everything else serves these):
1. **The photo that needs no form.** A resident sends a picture. The system says "Downed tree, severity 4, safety hazard", knows where it is, and shows her who is coming.
2. **The scale.** In a storm, hundreds of reports become a few dozen real jobs on the map.
3. **The loop closing.** A person clicks Approve, the DevRev ticket closes, and **"Fixed!" lands on the phone**.

Two windows on one laptop (see "One device" below): **left** = the resident, **right** = the municipality's portal (PIN `city`), with a DevRev tab beside it. Two people if you can: one speaks, one drives.

## The transcript (line by line, as you would actually say it; about 340 spoken words)
**YOU** = what you say. **[DO]** = what happens on screen or in your hands (say nothing). Short lines on purpose: breathe between them.

### 0:00 The opener [live Operations screen; press Alt+I so the opener plays over it; phone in your hand]
1. [DO: Alt+I. The ways problems reach a city (phone call, email, social media, front desk, council member) fly into the logo and "Every fix starts here." appears. Start speaking as it settles; do not wait in silence]
2. **YOU:** "Every fix starts the same way. Somebody notices."
3. **YOU:** "Then it goes... somewhere. A phone call. An email to a council member. A post on social media. A word at the front desk."
4. **YOU:** "And by the time it reaches a crew, days are gone."
5. [DO: pause for one full second; press **Space**; the overlay clears and the Operations map is live behind it]
6. **YOU:** "Civic Flow is where every fix starts. One front door. A resident sends a photo... and the fix is on its way in seconds."

### 0:25 Scale: a storm [laptop: Operations]
7. [DO: click **Flooding** under "Run the story"; say nothing for two seconds while the map fills]
8. **YOU:** "Now a storm. This one's simulated: hundreds of reports about the same flooded street."
9. [DO: the reports fold into issues; the counter climbs]
10. **YOU:** "In most places, that's hundreds of calls and hundreds of work orders. Here they collapse into a few dozen real jobs. Matched by **meaning**, not just location. **Akamai's embeddings** know 'water all over the road' and 'the street's a river' are the same problem."

### 0:55 The resident [phone: hold it up so the room can see]
11. [DO: tap Report, choose the **downed tree** photo, tap Send. Do not pick a category]
12. **YOU:** "Now the resident. No form. No phone call. Just a photo."
13. [DO: stop talking for three or four seconds while the screen works]
14. [DO: the reveal appears: "Identified: Downed tree"]
15. **YOU:** "Downed tree. Severity four. Safety hazard."
16. **YOU:** "**Claude on AWS Bedrock** read the photo. The system knows exactly where it is: which district, whether it's near a school, so it knows how urgent it is and which crew owns it. Agents built with **Strands**, running on **Akamai's models**, did the thinking."
17. **YOU:** "And she sees all of it. Who's coming. And by when."

### 1:35 The loop closes [laptop: Workflow]
18. [DO: switch to Workflow; the case is at the top under "New, just in"; point at it]
19. **YOU:** "On the municipality's side, this is the first thing the supervisor sees. One report. One **real DevRev ticket**."
20. [DO: click the DevRev tab for three seconds, then back]
21. **YOU:** "Change it there, our board follows. Act here, DevRev follows."
22. [DO: click the Vendors tab for three seconds, then back to Workflow]
23. **YOU:** "The crew sees the same job in their queue."
24. [DO: click **Start work**, then **Attach after-photo**, then **Request verification**]
25. **YOU:** "The crew's done. They send a photo."
26. [DO: the agent line takes 10 to 20 seconds; keep talking, do not stand in silence]
27. **YOU:** "Now, everyone asks the same thing about AI. What if it's wrong?"
28. **YOU:** "So the model isn't the judge. The agent recommends. But **code** decides what it's allowed to close."
29. **YOU:** "A safety hazard like this? A person always decides. The AI can hand a case to a human. It can never overrule the policy."
30. [DO: click **Approve and close**; turn the phone toward the room]
31. **YOU:** "So I approve. DevRev closes the ticket. And she gets..."
32. [DO: hold the phone up; "Fixed!" shows; wait one beat]
33. **YOU:** "...Fixed."

### 2:30 What leadership sees, and the close [laptop: Impact]
34. [DO: switch to Impact; drag the "Check our math" slider once]
35. **YOU:** "And for leadership: how many reports, how many real jobs, how much staff time it saves. Real Kansas City data; the savings are estimates you can change."
36. [DO: stop moving; look at the room]
37. **YOU:** "Kansas City is where we built it. But every town, county and city has trees to remove, traffic to manage and roads to fix."
38. **YOU:** "Running right now on Akamai Cloud, reading photos with AWS, living in DevRev."
39. **YOU:** "Civic Flow. Every fix starts here. Thank you."

### Timing check
Opener 0:00 to 0:25, storm to 0:55, resident to 1:35, loop to 2:30, close to 3:00. If you are behind at the loop, skip lines 20 to 23 (the DevRev and Vendors tab flashes) and keep the rest. If you are ahead, open **How it's built** after line 39 and say: "That's what is running underneath, live."

## The logo and the opening line
- **Logo:** a "C" that is a loop. Reports stream in from the top (the dots) and a blue check closes the loop. Files are in `docs/brand/` (`logo-mark.svg`, `logo-mark-1024.png`, `logo-horizontal.png`, `banner.png` for the submission page).
- **Opening line (use this):** **"Every fix starts here."** The focus is speed and the front door: a fix can only start once the right crew knows, and today that news travels through phone calls, emails, social media and the front desk. Civic Flow is the single place where it starts, so it starts sooner. Under it: "One front door. Faster fixes for any city, town or rural municipality."
- **Keep the focus on the fix, not on any one channel.** Do not lead with 911 or the police: it pulls the room toward emergencies. Civic Flow handles non-emergency public-works issues; emergencies still belong to 911 (see the question table).
- **Be exact about what it is:** Civic Flow is the one front door residents use, with the workflow behind it. It does not pull in phone or other feeds today. Say "one front door **instead of** many", never "we collect them all".
- **The opener:** a short overlay on the **live Operations screen** (the map shows through, blurred), not a slide. About two seconds of animation: five ways a problem reaches a city fly into the logo, then the line appears. Sign in with the PIN, then press **Alt+I** from any page; **Space**, Enter, Escape or a click dismisses it. Also reachable at `https://city.172-232-2-16.sslip.io/ops?intro=1`.
- **Alternates if you want to swap the line:** "Fixed before the second call." / "The city that answers back." / "Fixes, not forms."

## One device: how to run and record it (you only need the laptop)
The resident app is a web page, so it runs in a phone-shaped window next to the city portal on the same screen. Everyone in the room sees both, and one recording captures the whole demo.
1. Run `powershell -ExecutionPolicy Bypass -File scripts\demo_windows.ps1` (add `-Demo` if the laptop's location is not in Kansas City). Left window = resident, right window = city portal (sign in with PIN `city`).
2. In the resident window, "Take a photo" opens a file picker: choose the real downed-tree photo from the laptop. Say "a resident sends a photo".
3. **Backup video (silent is fine, you talk over it live):** turn on Do Not Disturb (Win+N), press **Win+Shift+R** (Snipping Tool screen recording), drag over the whole screen, Start, run the demo once, then stop. Save as `backup.mp4` on the desktop. Play it from the Photos or Media Player app. Keep it about 90 seconds; stop early rather than record the Impact page twice.
4. **Your real phone is optional:** use it only if the judges are close enough to read it, and keep it for the "Fixed!" moment. A phone's own screen recorder (iPhone: Control Center, Screen Recording; Android: swipe down, Screen recorder) works if you want a clip of it, and Clipchamp (built into Windows 11) can place the two clips side by side, but the one-screen recording above is simpler and more reliable.

## Delivery notes (these matter as much as the words)
- **Silence is a tool.** Let the collapse and the "Identified" reveal land before you talk. The product is doing the selling.
- **One sentence to repeat:** "Every fix starts here." It is on the opener, so say it again right after "Fixed!" and as your last line.
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
