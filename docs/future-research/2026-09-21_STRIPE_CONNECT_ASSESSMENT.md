# Stripe Connect — integration assessment for the Röbel App (Expo)

**2026-09-21.** Research into Stripe Connect against Max's question: *can and how should the
Expo app let organisations (Vereine, Gastronomie, Initiativen, the Stadt) take money from
citizens, starting with "an org posts an event, sells a ticket, the citizen buys it in the app,
the org receives the money", and what else the same rail would unlock.* Method: one pass over
Stripe's current Connect docs (accounts v2, controller properties, charge types, hosted /
embedded onboarding, React Native SDK and its changelog, Terminal / Tap to Pay, DE pricing,
restricted-business list), Expo's SDK 55/56 pins, Apple's App Review Guidelines and Google
Play's payments policy, German ticket / Verein sources, cross-read against what already exists
in this repo (donations rail, events, org accounts, Circles "Röbel Münzen", Gnosis Pay) and
the prior legal research in `docs/MONERIUM_FIAT_TREASURY_RESEARCH.md`. Claims carry a source;
anything marked *(inference)* or *(estimate)* is our reading, not a Stripe statement.

Companions: [Monerium / fiat treasury research](../MONERIUM_FIAT_TREASURY_RESEARCH.md) (§5–§6
carry the Stripe ToS and ZAG analysis this doc builds on), [donations runbook](../DONATIONS_OPERATIONS.md),
[Bürgerrat contribution strategy](../buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md)
(rules R1–R6, the Röbel Card supersession), [legal masterplan](LEGAL_MASTERPLAN.md),
[Circles state](../CIRCLES_ROEBEL_MUENZEN_STATE.md).

---

## 0. Decision summary (BLUF)

**Yes, integrate Stripe Connect, as the app's fiat rail for money that flows from a citizen to
an organisation.** It is the one payment model where the platform never possesses the money
(Stripe, a licensed EMI, holds it; the org is merchant of record), which is exactly the
constraint the Monerium research set for any "platform fee for other orgs" model (§2 Abs. 1
Nr. 9 ZAG technical-provider exemption). It runs on the existing stack without a new native
build for the first slice, and the same connected account later carries membership fees,
course fees, pre-orders and in-person card payments.

**One gate before any code: our own strategy doc currently forbids it.** Rule R5 of the
Bürgerrat contribution strategy (2026-09-18) says "no ticket money held for third parties …
Donor-directed forwarding is Finanztransfergeschäft (ZAG)", and line 133 there reads "ticketing
beyond free RSVP is out (R5)". R5 was written against a platform that *holds and forwards*
money. Connect with direct charges is the architecture where the platform holds nothing, so
R5's own reasoning permits it; but the rule must be amended in that doc, and rule R2 ("no
partner, no feature") needs a named Verein first. This assessment is the material for that
amendment, not a licence to skip it.

| Question | Verdict | Why / what to do |
|---|---|---|
| **Should we?** | **Yes, for org → citizen sales.** Not for anything that touches Röbel Münzen, not for the retired Röbel Card, not for donations inside the app (store rules, §3). | Event tickets are the cleanest first product: physical service consumed outside the app (Apple 3.1.3(e), Google "tickets for live events"), no Widerruf (§312g Abs. 2 Nr. 9 BGB), orgs already post events (`events.account_id`, `ticket_price`, `max_attendees` exist), the org dashboard already exists. |
| **Is it allowed by our rules?** | **Not as written. Amend R5, name the partner (R2), then build.** | See the paragraph above and §6.4. The amendment is one sentence: "Money on rails where the platform never holds it: Münzen, Gemeinschaftskasse, and Stripe Connect direct charges settling into the org's own account." |
| **Which Connect shape?** | **Accounts v2, `dashboard: full`, `fees_collector: stripe`, `losses_collector: stripe`, direct charges, `application_fee_amount` = 0 at launch.** | The org owns a real Stripe account (sovereignty doctrine), Stripe does KYC / support / disputes, the platform pays **no** Connect fees (€0 per account, €0 per payout), refunds and chargebacks never hit our balance. A platform fee can be switched on per charge later without changing the account shape. The dashboard type is immutable, so this choice is made once (§1.2). |
| **Can it run in the Expo app?** | **Yes, in two steps.** Step 0 needs no native change (ships by OTA): hosted onboarding link + hosted Checkout in the system browser sheet, webhook issues the ticket. Step 1 adds `@stripe/stripe-react-native` (PaymentSheet with Apple Pay / Google Pay, Connect embedded onboarding and payouts screens) and needs an EAS build + runtime bump. | Stripe forbids WebViews for hosted onboarding but shows `SFSafariViewController` / Custom Tabs as the reference, which is what `expo-web-browser` opens. The RN SDK is Expo-supported via config plugin; Expo 55 pins `0.63.0`, SDK 56 pins `0.64.0`, Connect components went GA in `0.69.0`, latest is `0.77.0` (2026-09-16, new architecture only). |
| **What first?** | **Slice A: paid event tickets** (org connects Stripe → adds ticket types to an event → citizen buys → QR ticket in the app → org scans at the door). Flag-gated, tables first, one org as pilot. Then membership fees / course fees, then Tap to Pay. | Effort *(estimate)*: slice A ≈ 3 nights-and-weekends blocks of work for tables + 4 edge functions + 4 screens; step 1 native ≈ 1 more block plus the EAS cycle. |

**What this is not.** Not a replacement for the Gemeinschaftskasse donation rail (that stays on the
platform's own Stripe account + Monerium, with its "Unterstützen" wording rule). Not a Münzen
on-ramp (Stripe lists crypto exchanges/wallets as approval-required; we never sell Münzen for
euros through Stripe). Not a reopening of the voucher-edition Röbel Card (superseded 2026-09-18,
never market or reopen the Stripe flow there).

---

## 1. Stripe Connect in 2026 — what actually matters for us

### 1.1 Accounts: v2 and controller properties replace "Standard / Express / Custom"

- Stripe now recommends the **Accounts v2 API** for new Connect integrations; the old account
  *types* are marked "(veraltet)" and v1 accounts are described with *controller properties*
  instead ([integration recommendations](https://docs.stripe.com/connect/integration-recommendations),
  [accounts v2](https://docs.stripe.com/connect/accounts-v2)). v2 is "GA for Connect users".
- A v2 account gets *configurations*: `merchant` (accept payments; includes `card_payments`
  and `stripe_balance.payouts`), `customer` (be charged, replaces a separate `Customer`
  object), `recipient` (receive transfers). One identity, several roles.
- Three knobs decide the whole shape ([hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding),
  [risk management](https://docs.stripe.com/connect/risk-management)):
  - **dashboard**: `full` (a normal Stripe login for the org), `express` (a slim Stripe-hosted
    dashboard), `none` (only what we embed). **Immutable after creation.**
  - **fees_collector**: `stripe` (Stripe bills the org directly at standard rates) or
    `application` (Stripe bills the platform; the platform re-prices via application fees).
  - **losses_collector**: `stripe` or `application` (who eats an unrecoverable negative
    balance from refunds / chargebacks).
- Allowed combinations that are GA today: `full` + Stripe fees + Stripe losses (the old
  Standard), `express` + platform fees + platform losses (the old Express). `express` + Stripe
  losses exists but only under the `2026-08-26.preview` API version.
- Stripe-hosted onboarding "verwendet die Accounts v2 API" and is localized for DE; the org
  can also *reuse* an existing Stripe account's business data ("vernetztes Onboarding").
- Some features still need v1 endpoints (OAuth, recipient service agreement, Treasury /
  Issuing). None of them are on our path; a v2 account id can be passed to v1 endpoints anyway.

### 1.2 Charge types: direct charges are the only shape that fits our legal posture

| | Direct charge | Destination charge / separate charges & transfers |
|---|---|---|
| Who transacts with the citizen | the org (merchant of record; its name on the card statement, its branding on Checkout) | the platform (merchant of record) |
| Where the money lands | the org's Stripe balance, minus Stripe fee, minus optional `application_fee_amount` to us | the platform balance, then a transfer to the org |
| Refunds / disputes | hit the org's balance; platform can refund on their behalf via the `Stripe-Account` header | hit the platform balance; "kann Ihre Plattform die Gelder nicht ohne Weiteres von verbundenen Konten zurückfordern" |
| Stripe's own recommendation | "Wir empfehlen, Direct Charges für verbundene Konten zu verwenden, die Zugriff auf das vollständige Stripe haben" | for Express / no-dashboard accounts; platform is liable |
| Our ZAG reading *(inference, consistent with the Monerium research §6)* | platform never holds citizen money → §2 Abs. 1 Nr. 9 ZAG technical-provider posture holds | platform receives and forwards third-party money → the Finanztransfergeschäft question the Monerium research flagged for donation portals; would need a lawyer before any fee |

Direct charges also keep every PaymentIntent / Charge *on the org's account*, not ours: the
platform reads them with the `Stripe-Account` header ([direct charges](https://docs.stripe.com/connect/direct-charges)).
That is a feature for a civic app (the org's books are the org's), and a constraint for our
reporting (we mirror what we need into Supabase from webhooks).

### 1.3 Onboarding options and where each runs

| Option | What it is | Mobile reality |
|---|---|---|
| **Stripe-hosted onboarding** (Account Links) | single-use URL, expires after minutes, `return_url` + `refresh_url`, Stripe collects KYC and ToS acceptance | "nur in Webbrowsern unterstützt. Sie können es nicht in eingebetteten Webansichten … verwenden." Stripe's own iOS/Android samples open it in `SFSafariViewController` / Custom Tabs, which is what `expo-web-browser` does. Works today, no native change. |
| **Embedded onboarding** (Connect embedded components) | `ConnectAccountOnboarding`, `ConnectPayouts`, `ConnectPayments` rendered inside our app from an `AccountSession` client secret | Exists for **React Native** in `@stripe/stripe-react-native` (needs `react-native-webview`): private preview in 0.59.0 (2026-02), GA in 0.69.0. Stripe's docs for the RN variant list Account Onboarding, Payments and Payouts ([RN embedded components](https://docs.stripe.com/connect/get-started-connect-embedded-components.md?platform=react-native)). Needs the native SDK → EAS build. |
| API onboarding | we build every KYC form | "Nur, wenn Sie die betriebliche Komplexität … tragen können." Not for us. |

Completion is never signalled through the return URL: read `details_submitted`,
`charges_enabled`, `payouts_enabled` and `requirements.currently_due` from the account, and
listen to `account.updated` webhooks. For `full`-dashboard accounts `account_update` links do
not exist; the org edits itself in its Stripe dashboard (or via the embedded components).

### 1.4 Pricing (Germany, verified 2026-09-21)

Payment processing ([stripe.com/de/pricing](https://stripe.com/de/pricing)): **1,5 % + 0,25 €**
EWR standard cards, 2,8 % + 0,25 € EWR premium cards, 2,5 % + 0,25 € UK cards, 3,15 % + 0,25 €
other international, **0,35 €** per SEPA-Lastschrift, **20 €** per chargeback (refunded if won),
Apple Pay / Google Pay at card rates, Stripe fees on a refunded payment are not returned.

Connect ([stripe.com/de/connect/pricing](https://stripe.com/de/connect/pricing)):

| Model | Monthly per active account | Per payout | Instant payout |
|---|---|---|---|
| **Stripe bills the org** (`fees_collector: stripe`) | **€0** | **€0** | 1 % |
| Platform bills the org (`fees_collector: application`) | **€2** (active = a payout happened that month) | **0,25 % + 0,10 €** | 1 % |

"Platforms that choose to let Stripe bill their connected accounts for payment fees directly do
not incur additional account, payout volume, tax reporting, or per-payout fees." An application
fee costs nothing extra ("Es fallen keine zusätzlichen Stripe-Gebühren für die Plattformgebühr
selbst an"). Nonprofit pricing exists (DE eligible, ≥80 % donation volume, ~1,2 % + 0,25 € per
third-party sources, applied per account by Stripe support) and is a per-org matter, not ours.

Worked example, €10 ticket, EEA debit card: Stripe takes €0,40; the org nets **€9,60**; the
platform takes €0 (or, if we ever switch a fee on, e.g. €0,30 → org nets €9,30).

### 1.5 The React Native SDK and Expo

- `@stripe/stripe-react-native` is Expo-supported with a config plugin (`merchantIdentifier`
  for Apple Pay, `enableGooglePay`); Apple Pay / Google Pay need a development build, never
  Expo Go ([Expo docs](https://docs.expo.dev/versions/latest/sdk/stripe/)).
- Version pins: Expo SDK 55 → `0.63.0`, SDK 56 → `0.64.0` (from `bundledNativeModules.json`).
  Upstream: `0.77.0` (2026-09-16) which "Removed support for the React Native old
  architecture"; Connect embedded components were private preview in `0.59.0` and GA since
  `0.69.0`. We are on **Expo SDK 56 / RN 0.85.3** with `newArchEnabled: true` on both
  platforms (`apps/expo/app.config.ts`), so the pin is `0.64.0` and a newer-than-pin install
  is a compatibility check, not a blocker *(inference — verify with `npx expo install --check`
  on the branch; `react-native-webview 13.16.1`, which the Connect components need, is already
  installed)*.
- PaymentSheet: `StripeProvider` takes `stripeAccountId` for direct charges, `urlScheme` for
  3DS / bank redirects, `merchantIdentifier` for Apple Pay; server returns the PaymentIntent
  client secret created with the `Stripe-Account` header and `application_fee_amount`.
  Apple's review "verlangt die Aktivierung der Kartenscanfunktion" → `NSCameraUsageDescription`.
  PaymentSheet does not yet accept v2 *customer-configured* accounts ("unterstützt nur
  `Customer`-Objekte"), which is fine: we do not save cards.
- Tap to Pay: in the Terminal **React Native SDK** (public preview), Germany is on the iPhone
  availability list, needs an Apple entitlement (`com.apple.developer.proximity-reader.payment.acceptance`)
  and a separate Apple review with the "How to Tap" education overlay
  ([tap to pay](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios)).
  Works with connected accounts. Phase 2 material (Vereinsfest cash desk).

### 1.6 Stripe-hosted Checkout as the zero-native path

A Checkout Session created with the `Stripe-Account` header is a direct charge, shows the
**org's** branding, takes `payment_intent_data[application_fee_amount]`, redirects to
`success_url?session_id={CHECKOUT_SESSION_ID}`, and reports through `checkout.session.completed`
/ `checkout.session.async_payment_succeeded` / `…failed`
([direct charges, hosted](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted)).
Apple Pay works inside `SFSafariViewController`, Google Pay inside Custom Tabs, so the
in-browser sheet is a real wallet checkout, not a form. This is the same primitive the
donation rail already uses on the platform account (`apps/web/src/app/api/donate/webhook`).

---

## 2. Fit with our doctrine

1. **The platform never holds the money.** Direct charges only. Money moves citizen → org's
   Stripe balance → org's IBAN. We see it, we never touch it. This is route (2) of the Monerium
   research's "platform-fee models that work in Germany".
2. **The org owns its account.** `dashboard: full` gives a Verein a normal Stripe login it can
   use with or without us, disconnect from us, and take to another platform. Records
   self-sovereign, like the CommunityRegistry idea, applied to money.
3. **Stripe does the risk work.** With `losses_collector: stripe` the org's negative balance is
   Stripe's problem, Stripe contacts the org directly, and we cannot pause payouts (we do not
   want that power).
4. **Münzen stay Münzen.** Stripe is euros only. Rewards for buying a ticket can still be paid in
   Röbel Münzen from the existing reward path, but no Stripe flow ever prices or sells Münzen.
5. **Every rail behind a flag.** `app_settings.stripe_connect_enabled` (org side) and
   `stripe_tickets_enabled` (citizen side); missing key = disabled, same as `donations_enabled`.
6. **Expo is the only citizen client.** Both the org side (connect, ticket types, scanner) and
   the citizen side (buy, ticket wallet) live in the Expo app; the web org dashboard gets the
   same "Zahlungen" panel later, not first.

### 2.7 Why not end-to-end on Gnosis Pay / EURe (asked 2026-09-21)

The stablecoin acceptance rail (`docs/superpowers/specs/2026-09-04-stablecoin-acceptance-rail-design.md`)
already has the same posture as Stripe direct charges: D7 "never in the money flow", D6 no
fee, the merchant's account is its own Gnosis Pay Safe. So the values question is not
"custody vs no custody"; both rails leave the platform outside the money. What differs is
**who must pass KYC** and **who can be a seller today**:

| | Stripe Connect, direct charges | Gnosis Pay + EURe (spec D4) |
|---|---|---|
| Buyer needs | any card, Apple Pay, Google Pay; no account beyond the app | EURe in the thirdweb wallet → a KYC'd Gnosis Pay IBAN and a SEPA top-up first; there is no card→EURe on-ramp anywhere (Monerium research §5) |
| Seller needs | a Stripe account in the Verein's name (Vorstand + Vereinsregisterauszug + IBAN) | a Gnosis Pay account; v1 supports **individuals only**, KYB for companies is an open question with Gnosis Pay (spec §3, §12); a Verein cannot legally receive into a Vorstand's personal Safe |
| State of the rail | GA, DE, Vereine onboard on other platforms every day | D2C wound down 09-2026, partner platform in flux, SIWE domain gate only via workaround, Max's own KYC not finished, IBAN brokerage unverified |
| Refunds / disputes | Stripe tooling, org's dashboard | manual transfer back; no disputes (fine for tickets) |
| Fees | 1,5 % + 0,25 € per card payment to the org | ≈ 0 (sponsored gas) |
| Intermediaries | Stripe (US), the org's bank | Monerium (EMI, EURe issuer), Gnosis Pay / Monavate (KYC, card), the org's bank on off-ramp |

Neither rail is "sovereign" in the strong sense: EURe is a regulated e-money token behind a
KYC gate, and the euro leaves the chain through an EMI either way. The honest reading is
that for a Verein selling a €5 ticket to 200 Röbelers this autumn, the EURe rail has a buyer
side of roughly zero and no legal seller type. For a sole-trader Gastronomie whose regulars
already run Konto & Karte, it is exactly right, and that is what the acceptance spec targets.

**Decision:** one ticket model, two acceptance rails. `ticket_orders.rail ∈ ('stripe','eure','free')`
(same idea as `donations.rail`), one order screen with "Mit Karte / Apple Pay" (Stripe direct
charge, when the org has a connected account) and "Mit Konto (EURe)" (EIP-681 transfer to the
org's Gnosis Pay Safe, when the org has one and the buyer holds EURe), same `tickets`, same
QR, same scanner. Stripe ships first because it has buyers and legal sellers today; the EURe
share grows with Konto & Karte adoption and nothing locks an org into Stripe, because the
connected account is theirs. A citizen with a Gnosis Pay card can already pay the Stripe
Checkout with it: the card rail is where the two meet. Röbel Münzen stay the community
layer (a Münzen reward per ticket, Münzen-priced community events), never the euro rail.

---

## 3. Store rules per use case

| Use case | Apple App Review | Google Play | Verdict |
|---|---|---|---|
| Event ticket, course fee, membership, table / pre-order, physical goods | 3.1.3(e): "physical goods or services that will be consumed outside of the app … **must** use purchase methods other than in-app purchase, such as Apple Pay or traditional credit card entry" | Play billing "must not be used" for physical goods / services, explicitly incl. "tickets for live events", gym memberships, food delivery | **Stripe is not only allowed, it is required.** |
| Anything digital consumed in the app (premium features, badges, unlocking content) | 3.1.1: IAP mandatory | Play billing mandatory | Never route through Stripe. We have no such product; keep it that way. |
| Donations to an org from inside the app | 3.2.1(vi): only **approved nonprofits** (non-US via Benevity, per org, with the platform's Team ID) may fundraise in a third-party app, and must offer Apple Pay; "Nonprofit platforms … must ensure that every nonprofit listed in the app has also gone through the nonprofit approval process." Otherwise 3.2.2(iv): collect "outside of the app, such as via Safari". | "Google Play does not support direct charitable donations" via Play; external browser only | **Not in slice A.** A per-org "Unterstützen" button can open the org's own Checkout in the *external* browser (not the in-app sheet) *(inference on where Apple draws the Safari line — confirm with App Review before shipping)*. The Gemeinschaftskasse rail is unchanged. |
| Tips to a person (Münzen tips exist today) | crypto rules 3.1.5 already cover Münzen; euro tips would be P2P | Play: P2P where 100 % reaches the creator is exempt | Out of scope; Münzen tips already do this better. |
| Crowdfunding / Bürgerbudget with money | Stripe: "Crowdfunding-Plattformen" are approval-required; VermAnlG questions in the legal masterplan | | Later, separate decision. |

Apple also requires the card-scanning capability to be enabled when the native PaymentSheet is
used (camera usage string), and Tap to Pay carries its own entitlement review.

---

## 4. German legal notes (org side vs platform side)

**Platform side (us).**
- Stripe platform account: the existing account used for the donation Checkout is the natural
  Connect platform. Stripe underwrites the platform's business description; the app also
  contains a crypto wallet (Gnosis Pay card, Circles). Stripe's restricted list marks
  "Kryptowährungsbörsen und Wallets" as approval-required, "Spendensammlung durch
  gemeinnützige … Organisationen" and "Crowdfunding-Plattformen" as due-diligence categories
  ([restricted businesses](https://stripe.com/de/legal/restricted-businesses)). Describe the
  Connect use honestly and narrowly ("Bürger-App, Ticketverkauf und Gebühren für lokale
  Vereine und Betriebe"); nothing Stripe-processed touches crypto. *Risk: medium, see §10.*
- Legal entity: a fee-taking platform is commercial activity and belongs in the commercial
  entity from the legal masterplan, not in a future gemeinnütziger e.V.; with
  `application_fee_amount = 0` the platform earns nothing and the Nebentätigkeit question stays
  where it is today. Switching a fee on is the moment to have the entity and the Arbeitsvertrag
  check done.
- ZAG: see §1.2. Direct charges keep us in the technical-provider posture. Do not build
  destination charges "because reporting is easier".
- DSGVO: Stripe is a separate controller for the org's payments; we store order metadata
  (who bought what) as processor-free first-party data; DPIA addendum (payment data category)
  in `docs/DSGVO_AI_ACT_COMPLIANCE.md`.

**Org side (the Verein / Betrieb), and what we must make easy.**
- KYC for an e.V.: legal form non-profit / Verein, Vereinsregisternummer, a **Vorstand** as
  representative with ID verification, an IBAN in the Verein's name, and a Vereinsregisterauszug
  (or Freistellungsbescheid / Gründungsurkunde) whose name and address match the account
  "1:1", no Postfach ([Yolawo guidance](https://support.yolawo.de/de/articles/6022529-hinweise-zur-accounterstellung-und-verifizierung-bei-stripe),
  [Rausgegangen guidance](https://rausgegangen-assist.freshdesk.com/support/solutions/articles/44002618745-wie-trage-ich-mich-bei-stripe-als-verein-ein-)).
  Other German platforms (Vereinsplaner "VereinsPay", Yolawo, Rausgegangen, Communi,
  PLAYSPORTS) onboard Vereine exactly this way through Connect; we can copy their help texts.
- Widerruf: no Widerrufsrecht for a dated leisure event, also when sold via an intermediary
  (§312g Abs. 2 Nr. 9 BGB; BGH 2022). Memberships / courses without a fixed date **do** carry
  it; show the Widerrufsbelehrung there.
- Button-Lösung (§312j BGB), PAngV, the org's Impressum and AGB: our in-app order screen must
  show price incl. VAT, the org as seller, and link the org's terms before handing to Checkout;
  Checkout's `submit_type` can be set to `book` / `pay`. *(Have a lawyer confirm the button
  wording once; every German ticket platform has been through this.)*
- Tax is the org's: Zweckbetrieb vs wirtschaftlicher Geschäftsbetrieb, §4 Nr. 20/22 UStG
  exemptions for cultural / sporting events, Kleinunternehmer. Stripe Tax exists for connected
  accounts but is not needed for slice A; the org gets Stripe's receipts and its own dashboard.
- Nonprofit pricing: the org applies with Stripe support after Gemeinnützigkeit; nothing on our
  side.

---

## 5. Use-case matrix (what the same connected account unlocks)

| # | Use case | Connect primitive | Store rule | Fit / when |
|---|---|---|---|---|
| 1 | **Paid event tickets** (Vereinsfest, Konzert, Kurs-Termin) | Checkout Session → direct charge; ticket row + QR; `checkout.session.*` webhooks | required non-IAP | **Slice A.** Events, org accounts and QR check-in already exist. |
| 2 | Free events with limited seats (RSVP) | none (same tickets table, no order) | n/a | Ships with slice A for free; makes the ticket wallet useful on day one. |
| 3 | **Mitgliedsbeiträge** (yearly / monthly) | Billing subscription on the connected account (`Stripe-Account` header, `application_fee_percent`); org manages in its own dashboard (only `full`-dashboard accounts can) | non-IAP (service outside app) | Slice B. Strong for Sportvereine; SEPA-Lastschrift at €0,35 beats card fees here. |
| 4 | Kursgebühren, Anmeldungen (VHS, Musikschule, Feuerwehr-Lehrgang) | Checkout Session, optional deposit | non-IAP | Slice B, same code path as 1 with a "no date" Widerruf text. |
| 5 | Vorbestellung / Tisch-Anzahlung for Gastronomie (`restaurants` exist) | Checkout Session or PaymentIntent with capture later | non-IAP | Slice C; needs the org-side order screen; partner-driven only. |
| 6 | In-person card payments at the Vereinsfest (Tap to Pay on iPhone / Android) | Terminal RN SDK (preview), connected account | Apple entitlement + review | Phase 2; the one feature small Vereine ask for that no bank gives them. |
| 7 | Per-org "Unterstützen" (Spende an den Verein) | Checkout `submit_type: donate` in the **external** browser | 3.2.1(vi) / 3.2.2(iv) | Only after App Review guidance; the org must itself be allowed to call it "Spende". |
| 8 | Marktplatz for individuals (Flohmarkt) | connected accounts for individuals | non-IAP | Not now: individual KYC, fraud surface, Stripe's own fee floor makes €3 items pointless. |
| 9 | Stadt fees (Amt, Hallenmiete, Parkausweis) | the Stadt's own connected account | non-IAP | Only if the Stadt asks; a jPdöR onboards as a company-type entity in DE *(verify business_type options for public bodies)*. Never pitch it next to the Stadt's own Röbel Card. |
| 10 | Vouchers / Gutscheine | | | **No.** Röbel Card is the Stadt's; the app's voucher edition is retired. |
| 11 | Anything priced in Röbel Münzen | | | **No.** Separate rail, separate spec (`project_muenzen_stablecoin_exchange`). |

---

## 6. What exists in the repo today (survey 2026-09-21)

### 6.1 Stripe is already here, on the web side only

| Piece | Where | State |
|---|---|---|
| Server SDK | `apps/web/package.json` → `stripe ^20.3.1`; client in `apps/web/src/lib/stripe.ts` (lazy Proxy so a missing key never breaks `next build`; **no `apiVersion` pinned**) | live |
| Two platform accounts | `stripe` ← `STRIPE_SECRET_KEY` ("event tickets and anything else that shares the main account"); `stripeCard` ← `STRIPE_SECRET_KEY_CARD` (the voucher entity) | live; Connect goes on the **main** account |
| Hosted Checkout + webhook, one-off event | `api/tickets/create-checkout`, `api/tickets/webhook`, `api/tickets/verify`, `api/tickets/redeem`; hardcoded `TICKET_CONFIG` (MV Boxen Landesmeisterschaft 2026, €2,99) → flat `event_tickets` table (**no `event_id` FK**, denormalized strings, `charge.refunded` is a `// TODO`) | works, not a foundation |
| Hosted Checkout + webhook, donations | `api/donate/create-checkout`, `api/donate/webhook` → `donations` ledger with a partial unique index on `stripe_session_id` | live, gated on ops |
| Hosted Checkout + webhook, Röbel Card | `api/roebel-card/*` → `roebel_card_purchases` (+ `20260417_roebel_card_stripe_idempotency.sql`) | orphaned by design (§4 of the strategy doc); entry points removed, no kill switch, deep link still reaches Stripe |
| Mobile → web → Stripe → deep link round trip | `apps/expo/lib/roebel-card-topup.ts`: POST to `EXPO_PUBLIC_API_BASE_URL` → `WebBrowser.openBrowserAsync(url)` → `roebel://roebel-card/topup-success?session_id=` → poll | **the exact idiom slice A reuses**; `expo-web-browser ~56.0.6` installed and in the plugin list; scheme `roebel`; `applinks:roebel.app` configured |
| Expo Stripe SDK | none | needed only for §1.5 features |
| Env documentation | 7 of 8 `STRIPE_*` names appear in no `.env.example` | fix while adding the Connect vars |

There is **no** Connect code anywhere: no `accounts.create`, `accountLinks`, `Stripe-Account`
header, `application_fee_amount`, `transfer_data`, and no org ↔ Stripe-account mapping.

### 6.2 Events and orgs are ready enough

- `events` (live DB, no creating migration): `account_id → accounts` (org ownership,
  `005_accounts_system.sql`), `ticket_price numeric`, `max_attendees integer` (both display-only
  today, nothing enforces capacity), `is_cancelled`, `event_dates` for multi-date events.
- `event_interests` is a bookmark, not an RSVP. `reward_events` + `apps/expo/app/e/[id].tsx` is
  the Smart Event QR *reward* check-in (Münzen), not ticket validation. Ticket redemption
  exists only on the web (`apps/web/src/lib/supabase-tickets.ts`, `/ticket/[code]`).
- Org model: `accounts` (`account_type` personal | organisation, `sub_type` restaurant |
  unternehmen | verein | stadt | fraktion, `is_verified`, extern moderation), `account_owners`
  (owner | admin | member). The Expo app "acts as" an org through `useAccount()` in
  `apps/expo/context/AccountContext.tsx` (`activeAccount`, `roleInActiveAccount`,
  `isOwnerOf`). **All membership writes go through the `org-membership` edge function**
  (wallet-signed message `roebel-org-v1:<action>:<wallet>:<ts>:<hash>`, EOA recovery with
  ERC-1271/6492 fallback) — the auth idiom for any new org-side write.
- Screens to extend: `apps/expo/app/submit-event.tsx` / `edit-event/[id].tsx` (already write
  `ticket_price`, `max_attendees`, `account_id`), `event/[id].tsx`, `org/settings.tsx`,
  `components/QRScanner.tsx` (parses `roebel-card:v1|v2:` payloads today).

### 6.3 Patterns to copy

- **Vendor webhook**: `apps/expo/supabase/functions/gnosispay-webhook/index.ts` — signature
  over `timestamp.rawBody`, replay window, "verifier unreachable = 503 (retry), bad signature
  = 401 (never retry)". Stripe's `constructEvent` replaces the Ed25519 part; the status-code
  discipline carries over.
- **Ledger idempotency**: partial unique index on the Stripe id
  (`donations_stripe_session_uq`, `idx_roebel_purchases_stripe_session_unique`) plus a
  pre-inserted `pending` row that the webhook flips to `paid`.
- **Org-bound payment account**: `merchant_payment_accounts` / `merchant_entities`
  (`apps/expo/supabase/migrations/20260904_merchant_payment_accounts.sql`) — one row per
  owner, status enum, RLS on with **no client write policy**, writes only through an edge
  function. The Gnosis Pay shape; Stripe gets its twin.
- **Feature flag**: `isStablecoinPaymentsEnabled` in `apps/expo/lib/supabase-app-settings.ts`
  — off when the key is missing, `'true'` = everyone, any other value = comma-separated wallet
  allowlist, `__DEV__` always on; tested in `lib/__tests__/stablecoin-gate.test.ts`.

### 6.4 The policy state

`docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md`: R5 "Money only on the rails that
exist … no ticket money held for third parties" (rationale: ZAG, no e.V./eG yet); line 133
"ticketing beyond free RSVP is out (R5)"; §4 retires the voucher Röbel Card and its Stripe
flow; R2 requires a named partner per feature. `docs/ROADMAP_AND_DEFERRED.md` lists "Stripe
API keys (fiat checkout, slice 3)" as deferred for the x402 line, unrelated to Connect.

---

## 7. Target architecture (slice A, then B)

### 7.1 Where the Stripe code lives

Keep every Stripe call on the web side (`apps/web/src/app/api/**`), next to the existing
client, secrets and three webhooks, and write to Supabase with the service role. Reasons:
one Stripe surface, one secret store, the `stripe` SDK is already a `serverExternalPackages`
citizen, and the Expo app already talks to `EXPO_PUBLIC_API_BASE_URL` for donations and the
old top-up. The edge-function route (`gnosispay-webhook` idiom) remains an option for the
check-in endpoint, which needs the wallet-signature auth that `org-membership` already
implements in Deno.

Pin `apiVersion` on the new client, use `stripe.v2.core.accounts` for account creation, keep
v1 endpoints for Checkout / PaymentIntents / refunds with the `stripeAccount` request option.

### 7.2 Data model (new tables; `event_tickets` and `roebel_card_*` untouched)

```
stripe_connected_accounts   -- twin of merchant_payment_accounts
  account_id uuid PK → accounts(id)
  stripe_account_id text UNIQUE            -- acct_…
  dashboard_type text                      -- 'full' | 'express' (immutable at Stripe)
  details_submitted bool, charges_enabled bool, payouts_enabled bool
  requirements_currently_due jsonb, disabled_reason text
  created_by_wallet text, created_at, updated_at
  -- RLS on; SELECT for owners/admins of the org; no client writes

ticket_types
  id uuid PK, event_id → events(id) ON DELETE CASCADE, account_id → accounts(id)
  name text, description text, price_cents int CHECK (>= 0), currency text DEFAULT 'eur'
  capacity int NULL, per_order_max int DEFAULT 10
  sales_start timestamptz NULL, sales_end timestamptz NULL, event_date_id → event_dates NULL
  vat_note text                            -- shown on the order screen; org's wording
  created_at, updated_at

ticket_orders
  id uuid PK, event_id, ticket_type_id, account_id (seller), quantity int
  buyer_wallet text, buyer_email text NULL, buyer_name text NULL
  amount_cents int, application_fee_cents int DEFAULT 0, currency text
  stripe_account_id text, stripe_checkout_session_id text NULL, stripe_payment_intent_id text NULL
  status text CHECK IN ('pending','paid','expired','refunded','cancelled','free')
  expires_at timestamptz                   -- pending hold; Checkout Session expires_at ≥ 30 min
  created_at, paid_at, refunded_at
  UNIQUE (stripe_checkout_session_id) WHERE NOT NULL

tickets
  id uuid PK, order_id → ticket_orders, event_id, ticket_type_id
  code text UNIQUE                         -- 10-char base32 + HMAC in the QR payload
  holder_wallet text, status text CHECK IN ('issued','checked_in','refunded','void')
  checked_in_at timestamptz, checked_in_by_wallet text

stripe_events                              -- idempotency for every webhook
  id text PK (evt_…), type text, account text NULL, received_at, processed_at, error text
```

Capacity is enforced in one SQL function `reserve_tickets(ticket_type_id, qty, buyer)` that
locks the `ticket_types` row (`FOR UPDATE`), counts `paid` + unexpired `pending` orders, and
inserts the pending order or raises. A cron (`pg_cron`, like the storage cleanup jobs) expires
stale pending orders. Free events use the same path with `status = 'free'` and no Stripe call;
that gives RSVP with a real seat count on day one.

Flags in `app_settings`: `stripe_connect_enabled` (org side, allowlist pattern),
`stripe_tickets_enabled` (citizen side). Missing = off.

### 7.3 Server routes (apps/web)

| Route | Does |
|---|---|
| `POST /api/connect/onboard` | auth = org owner/admin (wallet-signed message, same format as `org-membership`); creates the v2 account on first call (`dashboard: full`, `fees_collector: stripe`, `losses_collector: stripe`, `merchant.capabilities.card_payments`, country `DE`, prefilled `display_name`, `contact_email`, `business_profile.url` = the org's public page); upserts `stripe_connected_accounts`; returns an Account Link (`account_onboarding`, `collection_options.fields = eventually_due`, `return_url` / `refresh_url` = `https://roebel.app/connect/return?account=…` which redirects to `roebel://org/payments/return`). |
| `GET /api/connect/status` | reads the account (`details_submitted`, `charges_enabled`, `payouts_enabled`, `requirements`) and mirrors it; used after the browser sheet closes and before showing ticket-type UI. |
| `POST /api/tickets/checkout` | auth = logged-in citizen; `reserve_tickets(...)`; creates the Checkout Session **on the connected account** (`stripeAccount`), `mode: payment`, `line_items` from the ticket type, `payment_intent_data.application_fee_amount` (0), `expires_at` = order `expires_at`, `locale: de`, `submit_type: book`, `customer_email` if known, `metadata { order_id, event_id }`, `success_url = https://roebel.app/tickets/return?order=…` (→ `roebel://tickets/[order]`), `cancel_url` likewise; returns `url`. |
| `POST /api/webhooks/stripe-connect` | Connect endpoint (events from connected accounts): `checkout.session.completed`, `checkout.session.async_payment_succeeded` → order `paid`, mint `tickets`, push "Dein Ticket ist da"; `…async_payment_failed`, `checkout.session.expired` → `expired`; `charge.refunded` → order `refunded`, tickets `refunded`; `charge.dispute.created` → notify org owners; `account.updated` → mirror status. Every event first inserted into `stripe_events` (PK conflict = already processed → 200). |
| `POST /api/tickets/refund` | auth = org owner/admin; refund on the connected account with `refund_application_fee: true`; only for cancelled events (`events.is_cancelled`) or an explicit org decision. |
| `POST /api/tickets/checkin` | auth = org owner/admin/member of the event's org; verifies the HMAC in the QR payload, flips `issued → checked_in` atomically (`UPDATE … WHERE status = 'issued'` returning 0 rows = already used). Can live as an edge function reusing `org-membership`'s signature verifier. |

### 7.4 Client flows (apps/expo)

- **Org: "Zahlungen"** in `org/settings.tsx` (visible when `stripe_connect_enabled` passes for
  the owner wallet): state card (nicht eingerichtet → in Prüfung → aktiv, with Stripe's
  `currently_due` rendered as a to-do list), button "Mit Stripe einrichten" → `onboard` →
  `WebBrowser.openAuthSessionAsync(url, 'roebel://org/payments/return')` → on close call
  `status`. Help text copied from the Vereins-onboarding guidance (§4): Vereinsregisterauszug,
  Vorstand mit Ausweis, IBAN auf den Verein.
- **Org: ticket types** as a section in `submit-event.tsx` / `edit-event/[id].tsx`, shown only
  when `charges_enabled` (free types always allowed). `ticket_price` on `events` becomes a
  derived "ab X €" display, not an input.
- **Citizen: buy** on `event/[id].tsx`: "Ticket kaufen" → order sheet (type, quantity, price
  incl. VAT, seller = org name, org's AGB/Impressum link, "Kein Widerrufsrecht bei
  termingebundenen Veranstaltungen (§ 312g Abs. 2 Nr. 9 BGB)") → `checkout` →
  `openAuthSessionAsync` → return → poll the order (same as the old top-up screen) → ticket.
- **Citizen: ticket wallet** `app/tickets/index.tsx` + `app/tickets/[order].tsx`: QR
  (`roebel-ticket:v1:<code>.<hmac>`), event card, add-to-calendar (`expo-calendar` is already
  a plugin), refund state. Works offline once loaded.
- **Org: scanner**: extend `components/QRScanner.tsx` with the `roebel-ticket:` payload →
  `checkin` → green / red result, count of checked-in vs sold.
- **Push**: reuse `send-notification` for "Ticket da", "Event abgesagt, Rückerstattung läuft".

### 7.5 Slice B additions (needs an EAS build, runtime fence 3.8.0)

- `@stripe/stripe-react-native` (≥ `0.69.0` for Connect components; verify against the SDK 56
  pin), config plugin with `merchantIdentifier: merchant.com.maxbrych.roebelonchain`, Apple
  merchant id + Stripe iOS certificate, `NSCameraUsageDescription` for card scanning.
- PaymentSheet replaces the browser sheet for card / Apple Pay / Google Pay: `StripeProvider
  stripeAccountId={order.stripe_account_id}` per checkout, server returns a PaymentIntent
  client secret created on the connected account with `application_fee_amount`.
- `ConnectAccountOnboarding` / `ConnectPayouts` / `ConnectPayments` inside `org/payments`
  from an `AccountSession` (`POST /api/connect/session`), so a Vorstand never leaves the app.
- Mitgliedsbeiträge: Billing subscription on the connected account (`Stripe-Account` header,
  price on the org's account, `application_fee_percent`), SEPA-Lastschrift as the default
  method; the org manages members in its own Stripe dashboard (`full` is required for that).

---

## 8. Phased plan and effort

### 8.0 Stripe dashboard setup choices (Connect wizard, 2026-09-21)

| Wizard step | Choose | Because |
|---|---|---|
| Platform profile: "Sellers will collect payments directly" vs "Buyers will purchase from you" | **Sellers will collect payments directly** | = direct charges, sellers on receipts, "Stripe will be liable if sellers can't pay back negative balances" (§1.2). |
| "Plattform näher beschreiben" | narrow and honest: Bürger-App Röbel/Müritz; Vereine und lokale Betriebe verkaufen Eintrittskarten, Kurs- und Mitgliedsgebühren an Bürger; die Plattform hält keine Gelder | Stripe underwrites the platform; no Münzen, no Gnosis Pay, no crypto wording (§4). |
| "Branding hinzufügen" (marked optional) | do it: name Röbel, colour `#00498B`, icon = the navy windmill | Stripe-hosted onboarding requires name, colour and icon; Checkout shows the org's branding, onboarding shows ours. |
| Test connected account, "Was soll dieses Konto tun?" | **only** "Zahlungen von ihren eigenen Kundinnen und Kunden akzeptieren" (Händlerkonfiguration); leave "Übertragungen auf ihr Stripe-Saldo erhalten" (Empfängerkonfiguration) unchecked | merchant configuration = `card_payments` + payouts; recipient configuration exists for transfers, i.e. destination charges, which we never use. |
| Next wizard pages (responsibilities, dashboard, onboarding) | fees: **Stripe rechnet mit dem verbundenen Konto ab**; losses: **Stripe**; dashboard: **vollständiges Stripe-Dashboard**; onboarding: **von Stripe gehostet**; country DE; business type for a Verein: gemeinnützige Organisation / Verein | maps 1:1 to `fees_collector: stripe`, `losses_collector: stripe`, `dashboard: full` in `POST /api/connect/onboard` (§7.3); dashboard type is immutable. |
| "Ausweisdokument verifizieren — Max Brych" and "Endgültige Angaben bestätigen" | sandbox first (test account, hosted onboarding link, €1 Checkout with `4242…`, webhook), then activate | live activation is Stripe's platform review of the account holder and of roebel.app; this is decision 3 in §10 (which entity holds the platform account). |
|---|---|---|---|---|
| **0. Policy + ops** | Amend R5 / line 133; name the partner Verein; enable Connect on the main Stripe account, fill the platform profile, set branding; add `STRIPE_*` names to `.env.example`; test-mode connected account | Max decisions §10 | ½ block | Strategy doc updated; a test `acct_…` exists with `charges_enabled` |
| **A. Tickets, OTA-shippable** | §7.2 tables + `reserve_tickets` + cron; §7.3 routes; §7.4 screens; flags; Jest tests for capacity, HMAC, fee maths; Stripe test cards incl. 3DS and `async_payment_failed`; one real €1 ticket with the partner Verein | Phase 0 | 3 blocks | Partner's next event sells tickets; scanner used at the door; no `event_tickets` rows touched |
| **B. Native + memberships** | §7.5; runtime fence bump; store review notes citing 3.1.3(e); memberships for one Sportverein | A live for one event; EAS cycle scheduled | 1 block + EAS cycle | Apple Pay in-app; one org with SEPA membership fees |
| **C. Later** | Tap to Pay at a Vereinsfest (Terminal RN SDK, Apple entitlement); web dashboard "Zahlungen" panel; Gastronomie pre-orders; per-org "Unterstützen" in the external browser after App Review guidance | partner asks (R2) | per item | — |

Deliberately out: reviving `event_tickets` (the boxing flow stays as-is until the event is
past, then gets deleted), anything under `apps/expo/app/roebel-card/`, destination charges,
platform fees before the entity question is settled, Münzen pricing.

---

## 8.1 Shipped (2026-09-23)

Slice A is on `main` (plan `docs/superpowers/plans/2026-09-21-stripe-connect-tickets-slice-a.md`, 23 commits
from 47d3180e to c0b96ae4), reviewed task by task plus one whole-branch review and one fix wave.

- **Web (live on www.roebel.app):** `/api/connect/onboard|status`, `/api/tickets/types|checkout|order|mine|orders|checkin|refund`,
  `/api/webhooks/stripe-connect` (settlement bound to the order's account, session id and amount; late payments
  still mint; idempotent via `stripe_events`), return pages `/connect/return` and `/tickets/return`. Server-side
  flags `stripe_tickets_enabled` / `stripe_connect_enabled` gate checkout and onboarding.
- **Database:** `stripe_connected_accounts` (unique per org and livemode), `ticket_types`, `ticket_orders`,
  `tickets`, `stripe_events`, `reserve_tickets()`, `expire_ticket_orders()` on pg_cron every 10 min.
- **Expo (OTA, no native change):** org Zahlungen screen, ticket-types editor with order list and refunds,
  buy screen, ticket wallet with QR codes, door scanner; entry points in org settings, event editor, event
  detail and the profile grid.
- **Ops:** Stripe sandbox Connect webhook `we_1UIbS6If2c83sXcLc9RtP1Aq`; Vercel has the Connect secret key
  (sandbox), webhook secret, `TICKET_QR_SECRET`, fee 2 % + 0,10 € (Max's decision of 2026-09-21), base URL.
  `app_settings.stripe_connect_enabled` = Max's wallet, `stripe_tickets_enabled` = `true`.
- **Go-live checklist:** platform approval by Stripe → set `STRIPE_CONNECT_SECRET_KEY` to the live key and create
  a live Connect webhook endpoint (new secret) → orgs onboard again in live mode (sandbox rows stay, keyed by
  livemode) → widen `stripe_connect_enabled`. Deferred items live in the plan's ledger and the final review:
  partial refunds are not mirrored, the profile tile is not flag-gated, one theoretical webhook-before-session-id
  window.

## 9. Costs, summarised

| Who | Pays what |
|---|---|
| Citizen | ticket price; no surcharge (PAngV: the shown price is the price) |
| Org | 1,5 % + 0,25 € per EEA card payment (0,35 € SEPA), 20 € per lost dispute, Stripe receipts and dashboard included |
| Platform | €0 Connect fees under the recommended shape; Stripe test mode is free; one Apple merchant identifier; Vercel / Supabase already paid |
| Optional later | `application_fee_amount` per charge (e.g. €0,30 or 2 %) — needs the entity decision first |

---

## 10. Risks and the questions only Max can answer

**Risks**
1. *Platform underwriting vs the crypto features.* Stripe reviews the platform business; our
   app has a wallet and a card. Mitigation: honest, narrow Connect profile; no Stripe flow near
   Münzen or Gnosis Pay; keep the existing donation account as the platform account so history
   is consistent. If Stripe pushes back, the fallback is per-org Payment Links (each Verein's own
   Stripe account, no platform) — same store rules, no fee possibility, no in-app onboarding.
2. *Dashboard type is immutable.* If we pick `full` and later want to hide Stripe entirely, that
   needs new accounts. We accept `full` on purpose (§2.2).
3. *EAS build for step 1.* PaymentSheet, Apple Pay and embedded onboarding all need a new store
   build (runtime fence). Slice A avoids it; do not let slice A wait for it.
4. *Version drift.* Expo 55/56 pin `0.63.0`/`0.64.0`; Connect components are GA from `0.69.0`.
   Installing above the pin is normal but must be tested on a device build, not OTA (worklet /
   OTA lessons apply).
5. *Store review of the buy flow.* Apple sometimes rejects non-IAP flows when the reviewer cannot
   tell the good is physical. Mitigation: the order screen names the venue, date and address;
   review notes cite 3.1.3(e).
6. *Chargebacks on a Verein.* Stripe's problem contractually, but a small Verein losing €20 on a
   dispute is our reputational problem. Mitigation: 3DS on by default (Radar), tickets are
   non-refundable except event cancellation (org-triggered refund via the platform, application
   fee refunded too).

**Decisions for Max**
1. Amend R5 in `docs/buergerrat/2026-09-18_APP_CONTRIBUTION_STRATEGY.md` (and line 133) with
   the direct-charge flow-of-funds argument, or decide that ticketing stays out. Nothing
   below happens before this.
2. The partner Verein for slice A (R2): one org with an event in the next 8 weeks and a
   Vorstand willing to do the 10-minute Stripe onboarding.
3. Platform account holder now (the main Stripe account behind `STRIPE_SECRET_KEY`, which
   already runs the boxing tickets and the Gemeinschaftskasse checkout, under which entity?)
   and the moment a platform fee is allowed (entity + Arbeitsvertrag check).
4. `full` dashboard confirmed (sovereignty; the Vorstand gets a Stripe login) vs `express`
   (fewer screens for the Vorstand, platform pays €2 per active month and carries losses).
5. Whether the web org dashboard gets the same "Zahlungen" panel in slice A or later.

---

## 11. Sources

Stripe: [integration recommendations](https://docs.stripe.com/connect/integration-recommendations)
· [accounts v2](https://docs.stripe.com/connect/accounts-v2)
· [migrate to controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties)
· [hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding)
· [onboarding options](https://docs.stripe.com/connect/onboarding)
· [embedded components (React Native)](https://docs.stripe.com/connect/get-started-connect-embedded-components.md?platform=react-native)
· [account onboarding component (RN)](https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md?platform=react-native)
· [direct charges (RN PaymentSheet)](https://docs.stripe.com/connect/direct-charges?platform=react-native)
· [direct charges (hosted Checkout)](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted)
· [subscriptions with Connect](https://docs.stripe.com/connect/subscriptions)
· [risk management](https://docs.stripe.com/connect/risk-management)
· [Tap to Pay](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios)
· [DE pricing](https://stripe.com/de/pricing) · [DE Connect pricing](https://stripe.com/de/connect/pricing)
· [restricted businesses](https://stripe.com/de/legal/restricted-businesses)
· [stripe-react-native](https://github.com/stripe/stripe-react-native) and its CHANGELOG
· [Expo Stripe docs](https://docs.expo.dev/versions/latest/sdk/stripe/) · Expo `bundledNativeModules.json` (sdk-55, sdk-56).
Stores: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (3.1.1, 3.1.3(d)(e), 3.1.5, 3.2.1(vi), 3.2.2(iv))
· [Apple Pay for nonprofits](https://developer.apple.com/apple-pay/nonprofits/)
· [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/10281818).
Germany: [BGH on ticket Widerruf](https://www.it-recht-kanzlei.de/bgh-widerrufsausschluss-veranstaltungstickets.html)
· [Yolawo: Stripe-Verifizierung für Vereine](https://support.yolawo.de/de/articles/6022529-hinweise-zur-accounterstellung-und-verifizierung-bei-stripe)
· [Rausgegangen: als Verein bei Stripe](https://rausgegangen-assist.freshdesk.com/support/solutions/articles/44002618745-wie-trage-ich-mich-bei-stripe-als-verein-ein-)
· Vereinsplaner "VereinsPay" (Connect for Austrian Vereine).
