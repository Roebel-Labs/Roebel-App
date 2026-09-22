# Bürgerrat 2026 — where the Röbel App fits, and where it must not

**Status:** strategy record, v1 · **Date:** 2026-09-18 · **Author:** M. Brych with Claude
**Source of the recommendations:** [`2026-empfehlungen.md`](2026-empfehlungen.md) (Broschüre „Bürgerräte für MV“, Bürgerrat Röbel/Müritz 2026, points from the vote in the 4th session, handed to the Stadtvertretung on 2026-09-15).
**Product state it builds on:** the 11 recommendations are seeded as tracked forum threads (spec [`2026-09-16-buergerrat-discussion-threads-design.md`](../superpowers/specs/2026-09-16-buergerrat-discussion-threads-design.md)), currently **hidden** (`status='flagged'`, 11 rows on 2026-09-18) at Max's request; the kind-11 copies stay on the relay as the public record.

This document answers one question: **for each of the 11 recommendations, what can a private, citizen-carried app do that helps, without stepping onto the Stadt's turf?** It is a knowledge-base record for future sessions, not a partner-facing text. A German version for Vereine or the Bürgerrat is a separate deliverable.

---

## 0. The reading

The Bürgerrat handed the town a ranked list of civic priorities. Two of the mayor's comments set the frame for anything the app does:

- On **#7 (Kommunikationskanäle)**: *„Die Röbel-App ist eine private Initiative; die Stadtverwaltung nutzt die Mein-Ort-App.“* The Stadt has chosen its channel. Any move that looks like a bid to become the town's information platform confirms the reading that the app reaches into municipal space.
- On **#2 (Leerstand)** and **#9 (Engagement)**: the Stadt already runs an Unternehmerstammtisch, is introducing a Gutscheinkarte („Röbel Card“), drafts a Zweckentfremdungssatzung, and funds Vereine with 33.000 € per year plus ~55.000 € via the Partnerschaft für Demokratie.

So the opportunity is not "the app implements the Bürgerrat". It is narrower and better: **the app is the place where citizens, Vereine and businesses organise their own part of these recommendations, and where everybody can see what became of them.** That is a service the Mein-Ort-App does not offer and the Stadt does not need to provide.

Two things make this credible rather than self-promotional:

1. The recommendations are quoted, not owned. Source, points and the mayor's comments are stored as fields on each thread and rendered as such.
2. Every app action below has a **named non-municipal partner** or is pure citizen self-organisation. Where the partner is the Stadt (Bauhof, Öffentlichkeitsarbeit, Baurecht, Standortmarketing), the app does nothing.

## 1. Standing rules for this workstream

| # | Rule | Why |
|---|---|---|
| R1 | **Quote, track, never author.** Threads carry `source='buergerrat'`, `source_citation`, `official_comment`. The app is the Umsetzungs-Tracker (NSP-12 stages), the Bürgerrat is the author. | Keeps the line between Bürgerrat text and app discussion visible; matches the "Zitat aus der Broschüre" framing. |
| R2 | **Citizen-carried, partner-hosted.** Each feature names its partner (Verein, Betreiber, Eigentümer, Jugendrat, Bibliothek). No partner, no feature. | Turns "private initiative" from an accusation into the design. |
| R3 | **Never digitise what the Stadt is building.** Mein-Ort channels, the municipal Gutscheinkarte, a Mängelmelder for the Bauhof, Standortmarketing for Fachärzte. | Each of these is named in the brochure as the Stadt's job or the Stadt's project. |
| R4 | **Wording.** „Meinungsbild“, never „Abstimmung“ ([forum spec §10](../superpowers/specs/2026-08-29-umfragen-forum-design.md)); „Unterstützen“, never „Spende“ ([donations runbook](../DONATIONS_OPERATIONS.md)); „Röbel Münzen“, never CRC; never „Blockchain-Verwaltungsprojekt“ ([compliance doc](../DSGVO_AI_ACT_COMPLIANCE.md)). | Legal and political hygiene already settled elsewhere; this workstream inherits it. |
| R5 | **Money only on rails where the platform never holds it.** Münzen rewards and tips, Gemeinschaftskasse honoraria, and Stripe Connect direct charges that settle into the org's own Stripe account (the org is merchant of record; the platform takes a small application fee that Stripe deducts before settlement). No forwarded donations, no cooperative shares, no money held for third parties. | Holding or forwarding other people's money is Finanztransfergeschäft (ZAG); there is no e.V. or eG yet ([legal masterplan](../future-research/LEGAL_MASTERPLAN.md)). Direct charges keep the platform outside the money flow ([Stripe Connect assessment](../future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md) §1.2, decided by Max 2026-09-21). |
| R6 | **Stage changes come from public record only.** A thread moves to `beschlossen` or `umgesetzt` when a Stadtvertretung decision or a visible result exists, cited in the stage note. | The tracker is only worth anything if it never runs ahead of the town. |

## 2. Fit matrix

Fit = how much the app can contribute with a legitimate partner. "Substrate" = what already exists in the codebase or database on 2026-09-18.

| # | Recommendation | Pts | Fit | App role | Substrate that exists | Partner | Red line |
|---|---|---|---|---|---|---|---|
| 9 | Eigeninitiative, Ehrenamtsbörse | 5 | **strong** | Ehrenamtsbörse; Förder-Reminder for the two pots; engagement proof | marketplace listings (`product`/`service`), org accounts (11 Vereine), Fördermittel Agent spec + `apps/web/src/lib/foerdermittel`, `event_attend` reward claims | Kulturverein, Seniorenbeirat, any Verein | Never a "Stadt-Ehrenamtsbörse"; never touch the 33 k€/55 k€ money itself |
| 8 | Begegnungsangebote | 5 | **strong** | Recurring meet-up formats as events; one analog format hosted by the app team | events + org events dashboard + RSVP (`event_interests`) + attendance QR | Bibliothek, Vereine, Seniorenbeirat | Don't brand public rooms; don't schedule against Stadt formats |
| 4 | Sauberkeit, Müll | 11 | **strong** (citizen half only) | Müllsammelaktionen as rewarded events; Tauschecke online; Abfall info link-out | Abfallkalender screen (links to Landkreis), reward rail, pending mini-app `wertstoffhof-abfalltouren-roebel` | Schulen, Vereine, Familien | **No Mängelmelder** for container sites (Bauhof) unless the Stadt asks |
| 6 | Grünflächen, Bänke | 8 | **strong** (Patenschaften half only) | Patenschafts-Verzeichnis; „Unsere Stadt soll schöner werden“ as Meinungsbild with prizes | POIs (`supabase-pois`), posts with photos, Meinungsbild vocabulary, Münzen/GK honorarium | Wohnungsgesellschaften, Nachbarschaften | Bauhof staffing, Bufdi, Heckenschnitt = Stadt |
| 5 | Fitnessstudio Müritz-Therme | 10 | **medium** | Course calendar shared across gym + Vereine; member deals; partner in Röbel Card voucher flow | deals, events, mini-app platform (note: **no gym mini-app exists** in `mini_apps`), PSV Boxclub is an org in the app | Betreiber of the studio in the Müritz-Therme | Only if the Betreiber asks; never a competing offer |
| 1 | Begegnungsort „Kugellager“ | 13 | **medium** | Interest list for a Bürgergenossenschaft; pop-up trial events; „Kugellager-Gedächtnis“ stories | `card_interest`-style interest table pattern, events, story engine (Mecky co-write) | Jugendbar group, Kulturverein, later an eG | No shares, no pledges of money, no site lobbying for „Vegas“ |
| 2 | Leerstand | 12 | **medium** | Zwischennutzung listings (owner-submitted); founder flow; pre-order for alternative Versorgung | „Mach's in Röbel“ founder flow (`/machs-in-roebel`), marketplace, restaurant ordering module (`kitchen`/`order`/`menu`), org pins on the map | Eigentümer, Unternehmerstammtisch, Bäcker Bollewick | The Gutscheinkarte is the Stadt's, done analog with a provider (§4); no vacancy map without owner consent; Zweckentfremdung = Stadt |
| 10 | Jugendangebote | 2 | **medium** | Youth Meinungsbild + idea threads, only as the Jugendrat's own | forum categories, Meinungsbild, org accounts | Jugendrat, Jugendhaus | Must run under the Jugendrat's account; minors + consent age (§5) |
| 11 | Sport- und Freizeitflächen | 2 | **low** | POI layer „Sport im Freien“ | POIs, map | Jugendrat | Surfaces, equipment, puddle = Stadt |
| 3 | Fachärzte | 12 | **none** | — | — | — | Standortmarketing and MVZ are the Stadt's; do nothing |
| 7 | Kommunikationskanäle | 5 | **none by decision** | — | — | — | The Stadt chose Mein-Ort; any activity here confirms the „reaches into municipal space“ reading |

The matrix ranks by fit, not by Bürgerrat points. The two highest-scoring items (#1 with 13, #2 and #3 with 12) are exactly the ones where the app can only be a helper with partners, and the highest-fit items (#9, #8, #4, #6) scored 5 to 11. That is fine: the app's contribution is measured by whether Vereine and citizens use it, not by matching the ranking.

## 3. Per recommendation: what to build, with what, for whom

### #9 Eigeninitiative and Ehrenamtsbörse (strongest fit)

**Why this is the anchor.** An Ehrenamtsbörse is a listings board with a "Gesuch" side. The app has the board (marketplace: 13 listings today, types `product` and `service`), the org side (11 Vereine with accounts), a reward rail (`reward_claims` with `event_attend`, `event_submit`, `proposal_vote`), and a Fördermittel agent designed for exactly these Vereine.

**Build, in order of cost:**

1. **Ehrenamt listing type.** Add `listing_type='ehrenamt'` (Verein posts a Gesuch: task, time, place, contact; citizens respond). Filter chip „Ehrenamt“ on the marketplace. No new table. Seed with 3 to 5 real Gesuche from Vereine that already have accounts.
2. **The two funding pots as first-class Fördermittel entries.** The 33.000 € Stadt project funding (applications at the start of each year) and the ~55.000 € Partnerschaft für Demokratie are the two programs every Röbel Verein qualifies for and most under-claim. Put them into the curated core of the Fördermittel DB with deadlines, and let the outreach chain remind org owners in December and January. This is the single highest-leverage move in the whole list: it makes the Stadt's own money better used and competes with nobody. (Fördermittel Agent Phase 1: [spec](../superpowers/specs/2026-07-24-foerdermittel-agent-design.md); Phase 2 = drafting the Antrag.)
3. **Engagement proof.** Attendance at an Ehrenamt task is a QR check-in like event attendance today; the claim yields Münzen. Later the wallet can hold an „Engagement-Nachweis“ per Verein as a portable membership attestation (fits G2 in [Mission and goals](../MISSION_AND_GOALS.md)). Do not build the attestation before the listing type is used.

**Partner.** Kulturverein and Seniorenbeirat are named in the brochure; Bürger für Röbel hosts the threads. Ask two Vereine to post the first Gesuche before the chip ships.

**Red lines.** The app is never the Stadt's Ehrenamtsbörse and never handles the funding money. Wording „Ehrenamt gesucht“, not „Job“.

### #8 Begegnungsangebote (strong fit)

**Substrate.** The calendar is the original core of the app. Orgs manage their own events on the web dashboard (`/dashboard/events`, publish = live, RSVP via `event_interests`, attendance QR minting a linked `reward_events` row).

**Build.**

1. **Recurring formats.** Gesprächsabend, Koch- und Backabend, Spiele- und Themenabend, Heimatmarkt as series (recurrence on events, if missing) so a Verein sets a format once.
2. **Technikaustausch Jung und Alt, hosted by the app team, in the Bibliothek.** The library is named as a positive example in the brochure. A monthly analog hour where younger people help older people with phones and where the app is just one of the things on the table. This is the honest form of marketing this workstream allows: it delivers the Bürgerrat's format, is not "Tech-Übernahme", and onboards the demographic the app lacks.
3. **Positive examples visible.** The story engine (Mecky interviews, subject self-publishes, story badge) exists for exactly the brochure's "positive Beispiele sichtbar machen": Steinbrotbackofen, Krankenhaus-Ehemaligen-Treff. Ask the organisers, not the Stadt.

**Partner.** Bibliothek (room), Seniorenbeirat, Vereine.

### #4 Sauberkeit und Müll (strong fit for the citizen half)

The recommendation has two halves. Container sites, emptying, signage and cameras are the Bauhof and the Landkreis. Müllsammelaktionen, school projects, Tauschecken and incentives are citizen work.

**Build.**

1. **Müllsammelaktionen as rewarded events.** A Verein or school posts the action as an event; participants check in via the existing attendance QR; the claim yields Münzen. Getränke und Snacks als Anerkennung stay with the organiser. The brochure asks for "regelmäßige, städtisch organisierte" actions; the app version is the Verein-organised one, and the Stadt may join.
2. **Tauschecke online.** A `price_type` or category „Verschenken“ on the marketplace, tagged to the physical Tauschecke locations once they exist. Cheap, and it gives the physical corners a second life.
3. **Abfall information stays a link-out.** The Abfallkalender screen already links to the Landkreis Abfuhrkalender. A pending mini-app `wertstoffhof-abfalltouren-roebel` is in the catalogue; approve it if it is a citizen's, never re-author Landkreis data.
4. **Taschenaschenbecher.** Max's handwritten note says they exist and are available at the Haus des Gastes. That is a reply in the thread once the threads are shown again, not a feature.

**Red line.** No Mängelmelder for container sites or overflowing bins. That is a Bauhof channel; build it only if the Stadt asks for it, and then as their tool, not ours.

### #6 Grünflächen and Patenschaften (strong fit for the Patenschaften half)

**Build.**

1. **Patenschafts-Verzeichnis.** A green space is a POI with a steward (citizen, Nachbarschaft, Verein, Wohnungsgesellschaft) and a "looked after since" date. Public list, map layer, "Patenschaft übernehmen" request that the steward confirms. Bird breeding season note on the POI (the brochure asks for it).
2. **„Unsere Stadt soll schöner werden“ as a Meinungsbild.** Entries are posts with photos in a season category; the vote is an advisory Meinungsbild (never „Abstimmung“); the prize is Münzen or a Gemeinschaftskasse honorarium (rail exists, wording „Unterstützen“). A Wohnungsgesellschaft as co-host makes it credible.

**Red line.** Bauhof staffing, Bufdi, hedge cutting and benches are the Stadt's; the app records who cares for what, it does not schedule the Bauhof.

### #5 Fitnessstudio (medium; only with the Betreiber)

**Correction to the draft analysis:** there is **no gym mini-app** in the app or in the `mini_apps` table (live: `buerger-fuer-roebel`, `roebel-quiz`, `roebel-verwaltung-politik`, `stadtfuehrung-roebel-mueritz`). What exists is the mini-app platform, deals, events, and the Röbel Card voucher partner flow.

**What the app can broker.** The brochure asks the studio to cooperate with existing Sport- und Gesundheitseinrichtungen. PSV Boxclub and other Vereine are already orgs in the app, so a shared course calendar (gym courses plus Verein trainings), member deals, and course sign-up are one integration away. A gym mini-app is worth building only if the Betreiber wants it as theirs.

**Partner.** The Betreiber of the studio in the Müritz-Therme, not the Stadt.

### #1 Begegnungsort „Kugellager“ (medium; highest points)

The Bürgerrat's top item is a place, an organisational form (Bürgergenossenschaft) and a process (ergebnisoffen prüfen, Bürger früh gewinnen). The app can serve the process, not the place.

**Build.**

1. **Interessenliste „Begegnungsort“.** The same pattern as the Röbel Card `card_interest` table (8 rows today): a citizen says "I would use it / I would help / I would consider a Genossenschaftsanteil". Non-binding, no money, exportable for the group that eventually founds the eG. Shown publicly only as a count.
2. **Pop-up trial events.** The brochure suggests „schrittweise Öffnung“ and „Mehrfachnutzung“. Trial evenings (Musik, Dart, Billard, Tischkicker) in existing rooms are events with attendance; the attendance data is the argument for the Standortprüfung.
3. **Kugellager-Gedächtnis.** The brochure defines the target by the qualities of the old Kugellager. A story-engine series (people who were there, photos, what made it work) turns a nostalgic reference into a written spec for whoever builds the new one.

**Red lines.** No shares, no pledged money, no lobbying for a specific site (the brochure names „Vegas“ as one to check, not as the answer). A Genossenschaft with real money is the legal-masterplan path, years out.

### #2 Leerstand (medium; only with owners and the Stammtisch)

**Build.**

1. **Zwischennutzung listings.** Owners submit a vacant space with allowed uses and a period; founders, Vereine and pop-up organisers respond. Owner-submitted only, the same rule as org pins on the map. No scraped or crowd-sourced vacancy map, which would be an unwelcome public register of private property.
2. **Founder flow.** `/machs-in-roebel` („Gewerbe gründen“, „Verein gründen“, „Freelancer werden“, „Kreativ werden“) already exists for the brochure's „Existenzgründer berücksichtigen“. Connect it to the Zwischennutzung listings and to the Fördermittel agent.
3. **Alternative Versorgung.** The brochure's example is the Bollewick baker taking pre-orders on social media for Saturday pickup. The app's restaurant ordering module (`kitchen`, `order`, `menu`) is a pre-order flow already. Offer it to that baker as a partner; it is a concrete, non-municipal win.
4. **Pop-up events** are events; ticketing runs on Stripe Connect direct charges (R5, amended 2026-09-21), free RSVP uses the same ticket model.

**Red lines.** Zweckentfremdungssatzung, Baurecht and Discounter obligations are the Stadt's. The Gutscheinkarte is settled (§4).

### #10 Jugendangebote (medium; only as the Jugendrat's own)

The brochure asks to survey young people regularly and involve them in planning. The forum's Meinungsbild and idea threads do this technically. The condition is ownership: it runs under a Jugendrat or Jugendhaus org account, they pose the questions, they own the results. The app team offers the tool and a walkthrough, nothing more.

**Check before building:** minors. DSGVO Art. 8 consent age is 16 in Germany; the app's verification and consent flows assume adults. Anonymous participation via Meinungsbild may be the only clean path for under-16s. Not legal advice; verify with the compliance doc before any youth feature.

### #11 Sport- und Freizeitflächen (low)

A POI category „Sport im Freien“ (Stadtgarten, Elefantenspielplatz, Schildkrötenspielplatz) with equipment and a photo. Anything about surfaces, equipment or the puddle is the Stadt. If the Jugendrat wants a Meinungsbild on where the next equipment should go, that is #10.

### #3 Fachärzte (none)

Standortmarketing, Wohnraum offers and MVZ operation are municipal and regional. The app has nothing to add and should not try. Record the recommendation, track its stage, say nothing else.

### #7 Kommunikationskanäle (none, by decision)

The Bürgerrat recommends the Mein-Ort-App, and the mayor's comment separates the Röbel App from the Stadtverwaltung. Any feature under this heading, including "we could syndicate their notices", confirms the reading that the app competes with the Stadt's channel. The thread stays as a neutral, complete quote including the comment. The only revisit trigger is the Stadt approaching us.

## 4. Settled: the „Röbel Card“ is the Stadt's, done analog with a large provider

The mayor's comment on #2 says the Stadt is introducing a Gutscheinkarte called „Röbel Card“. Max's information (2026-09-18): **the Stadt runs that project with a big company, the analog way. It is done; there is nothing for the app to do here.**

The app still contains a product of the same name: the voucher edition of the Röbel Card (modelled on zmyle networks) with a buyer landing, 8 interest registrations in `card_interest`, a partner registration flow, an employer Sachbezug flow, and a parked Stripe purchase. The older points-and-stamps system was renamed to Röbel Punkte.

Consequences, so no future session reopens this:

- The app's voucher-edition Röbel Card is **superseded**. Do not market it, do not open the Stripe flow, do not pitch it to the Stadt or the provider.
- Retire the surface when convenient: hide the `/roebel-card` entry points, keep the tables, and tell the 8 interested people that the Stadt's card is coming instead. A rename is pointless once the surface is hidden.
- The name „Röbel Card“ belongs to the Stadt's product in every UI text from now on. Röbel Punkte and Röbel Münzen keep their names.
- Whatever partner or employer logic is still useful (Sachbezug, partner acceptance) can return later under a different name and only with a partner who asks for it (R2).

## 5. Cross-cutting services (independent of any single recommendation)

| Service | What it is | State on 2026-09-18 |
|---|---|---|
| **Umsetzungs-Tracker** | Each recommendation's NSP-12 stage (`diskussion` → `beschlussvorlage` → `beschlossen` → `umgesetzt`, or `abgelehnt`/`ruhend`/`zurueckgezogen`) with a dated, cited Verlauf. The Bürgerrat participants themselves are the audience: they get to see what became of their work. | Built; stage changes are SQL inserts, no admin page; threads hidden. Stage notes must cite a public source (R6). |
| **Meinungsbild per recommendation** | Advisory sentiment on each thread once shown. | Vocabulary and validators exist; the 32104 Meinungsbild ladder is the follow-up spec of the forum. |
| **Public record** | The 11 threads and their replies as signed kind-11/1111 events on the relay, browsable at `index.roebel.app/events?kinds=11`. | Live since 2026-09-17. Nothing to build; mention it only as „Digitaler Nachweis“, never as blockchain. |
| **Story engine** | „Positive Beispiele sichtbar machen“ appears in #7, #8, #9, #10, #11. Mecky co-writes, the subject publishes. | Persistent Mecky shipped; story engine (Plan B) per the local-news spec. |
| **Reward rail** | Münzen for attendance and participation; the only "Anreizsystem" the app may run. | Live (`event_attend`, `event_submit`, `proposal_vote`). Münzen are not € redeemable, by policy. |
| **Fördermittel agent** | Honest funding shortlist for Vereine, proactive outreach. | Phase 1 spec 2026-07-24, code under `apps/web/src/lib/foerdermittel`. |

## 6. Sequencing

**Now, no partner needed (each a small slice):**
- Add the two Röbel funding pots to the Fördermittel curated core with deadlines.
- `listing_type='ehrenamt'` plus chip; „Verschenken“ on the marketplace.
- POI categories „Grünfläche mit Patenschaft“ and „Sport im Freien“.
- Retire the app's Röbel Card voucher surface (§4).
- Decide when the 11 threads are shown again (`update forum_threads set status='published' where source='buergerrat';`) and post the Taschenaschenbecher reply in #4.

**Partner conversations, in this order (cheapest legitimacy first):**
1. Two Vereine for the first Ehrenamt Gesuche (Kulturverein, Seniorenbeirat).
2. Bibliothek for the Technikaustausch hour.
3. A Wohnungsgesellschaft for Patenschaften and the „schöner werden“ season.
4. The Bollewick baker for pre-orders.
5. The Müritz-Therme studio Betreiber.
6. Jugendrat or Jugendhaus for their own Meinungsbild.
7. Unternehmerstammtisch for Zwischennutzung listings (through a member, not by inviting ourselves).

**Later, gated:** engagement attestations in the wallet (after Ehrenamt listings are used); Interessenliste Begegnungsort (after the Jugendbar group or Kulturverein asks for it); Kugellager story series (after two stories from #8 have run).

## 7. What this workstream must never become

- A parallel Rathaus. No official notices, no Mängelmelder, no Standortmarketing, no municipal card.
- A fundraising vehicle. No pledges, no shares, no forwarded money.
- A vote. Every sentiment feature is a Meinungsbild.
- A campaign. The app team appears as hosts of a Technikaustausch hour and as the maintainers of a tracker, not as advocates for any recommendation or site.

## 8. Open questions for Max

1. Which two Vereine post the first Ehrenamt Gesuche?
2. Is „Bürger für Röbel“ the right host account for the threads long-term, or should the Bürgerrat participants get their own org account once shown again?
3. Does the app team host the Technikaustausch hour itself, or only supply the room booking and the calendar entry?
4. Should the Fördermittel reminders for the January application window go out this December (first real use of the outreach chain)?
5. When are the 11 threads shown again?
