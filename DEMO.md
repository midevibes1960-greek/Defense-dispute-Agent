# Demo script (3:00) — Dispute Defense

Two paths. **Path A (preferred)** stages one real sandbox dispute so the climax is a genuine PayPal API 200. **Path B** demos without keys and makes the honest blocked-submission the punchline. Rehearse the one you'll present.

---

## Before the demo (Path A — stage a real sandbox dispute)

1. Create a sandbox app (developer.paypal.com → Apps & Credentials → Sandbox) and put keys in `.env.local` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`). Restart the server.
2. Create a dispute against your sandbox seller: in the sandbox, pay as a buyer, then open an "item not received" dispute on that transaction (Sandbox buyer account → Resolution Center). Note its amount — the script below works with whatever amount it has; say the real amount out loud.
3. Open **PayPal connection → Test again → Sync disputes now**. Your dispute appears with source **PayPal**.
4. Open it once *before* the demo: click **Agent: auto-fill evidence**. Add the carrier + tracking number in the evidence builder and **Save evidence details** (this is rehearsal; on stage you'll redo the decision live).
5. Set `APP_ACCESS_PASSWORD` if the demo instance is publicly reachable.
6. Day-of: `git pull`, restart, confirm the queue shows your synced case, and reload nothing else. Sample cases can stay loaded for the queue shot — they are labelled SAMPLE.

## Script — Path A (with sandbox keys)

| Time | Say / do |
|---|---|
| 0:00 | "Sellers lose PayPal disputes by missing one deadline — PayPal auto-closes in the buyer's favour. This is the workspace that stops that." Show the queue sorted by deadline, overdue first. |
| 0:20 | Open your **synced sandbox case** (source: PayPal). Point at Respond-by countdown, amount, buyer message. |
| 0:40 | Click **Agent: auto-fill evidence**. "The agent re-reads the dispute from PayPal and fills what PayPal already knows — tracking, refund IDs — and tells me honestly what's still missing." Show found vs missing. |
| 1:00 | Decision card: "82% win odds — and here's every factor, no black box. EV = odds × amount − fee. Contesting is worth $X; if EV were negative it would tell me to accept and save the fee." Edit the seller note live. |
| 1:40 | Click **Approve & submit evidence**. Show the modal: "This is the exact JSON that goes to PayPal. Nothing sends without my approval." Confirm. |
| 2:00 | **Real `provide-evidence` 200 from PayPal.** Case flips to Under review; submission history shows HTTP status. "That's not a simulation — that's PayPal's response, stored in the audit trail." |
| 2:30 | Back to queue: record the outcome when it settles; recovered money and win rate count **recorded outcomes only** — "the dashboard showed $0 and '—' this morning, because we refuse to pre-fill numbers." |
| 2:50 | Close: "Detect, enrich, decide, approve, submit — with a human on every money-moving step." |

## Script — Path B (no keys, sample data)

Same beats, with these changes:

- 0:20 **Load sample cases** (header button), open the $240 "Item not received" case (`PP-D-27803`).
- 1:40 Click **Approve & submit evidence** → the app returns an honest **409: sample case, NOT sent**, recorded in submission history as a blocked attempt. Say: "It refuses to fake a submission. With sandbox keys this button sends the identical payload to PayPal for real — the code path is the same, only the source gate differs."
- 2:30 Record outcome **Won** on the case you just defended. Recovered money updates from $0 — live proof metrics are outcome-driven.

## Judge-proofing checklist

- [ ] `npm test` passes (decision engine + metrics — mention it; judges ask).
- [ ] Queue search: try `PP-D-27803` and a buyer name — both must find the case.
- [ ] Type a tracking number into an incomplete case: Contest unblocks immediately (live checklist).
- [ ] Connect page: webhook URL shows your full origin.
- [ ] If asked "is the AI real?": without a key it's an explainable rules engine, labelled as such; with `AI_API_KEY` the LLM runs the versioned prompt in `/prompts/decide.md`, schema-validated and capped (unauthorised ≤ 65%). Show the model badge on the decision card.
- [ ] If asked "what if PayPal is down?": submissions record the real error + PayPal `debug_id` in submission history; nothing is marked sent.
- [ ] If asked "security?": `APP_ACCESS_PASSWORD` Basic-Auth gate, webhook signature verification + verify-before-dedupe, upload type/size validation, resolved cases can't be re-submitted.
- [ ] Honesty traps to keep clean: start the demo from an **empty or freshly loaded** DB (never demo the recovered-$ from a previous run as if it were live), and say sample amounts are samples.
