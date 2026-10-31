# Dispute Defense Agent — PayPal AI Hackathon 2026

A seller workspace that watches PayPal disputes, scores **contest vs accept** by expected value, builds the **reason-specific evidence pack** PayPal actually asks for, and submits via the Disputes API only after **human approval**. Built with Next.js + AG Grid, deployable to Render.

## Honesty first: what's real here

| Claim | Reality |
|---|---|
| PayPal integration | Direct Disputes API: list, show, `provide-evidence` (with file uploads), `accept-claim`, `make-offer`, `send-message`, webhook receiver with signature verification + dedupe. Beyond the Agent Toolkit, which can only list/get/accept. |
| Data | Persistent local database (`data/db.json`, atomic writes). Cases, decisions, submissions, and the full audit trail survive restarts. |
| Submissions | Sent to PayPal **only** for PayPal-synced cases when keys are configured. Otherwise the API returns 409 and the attempt is recorded as *not sent*. Nothing is ever simulated or marked successful without a PayPal 200. |
| Metrics | Recovered money and win rate count **recorded outcomes only** (won/lost/accepted). Win rate shows `—` until a case is actually decided. No pre-filled numbers. |
| AI | Deterministic, explainable rules engine (every factor shown with its weight). If `AI_API_KEY` is set, an LLM decision is requested, schema-validated, and labelled with the model name; on failure the UI says so and shows the rules decision. |
| Sample data | Opt-in only ("Load sample cases"), labelled SAMPLE everywhere, removable in one click. The app starts empty. |

## Run

```bash
cd dispute-defense
npm install
npm run dev        # http://localhost:3000
```

Starts as a real, empty local case manager: add disputes manually, or load samples to explore.

## Connect PayPal (sandbox, 2 minutes)

1. developer.paypal.com/dashboard → Apps & Credentials → Sandbox → create app.
2. Copy `.env.example` to `.env.local` and set `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (`PAYPAL_ENV=sandbox`).
3. Restart, open **PayPal connection** in the app, hit **Test** (real OAuth + dispute read), then **Sync disputes now**.
4. Optional webhooks: point the app's webhook at `https://<your-host>/api/webhooks/paypal` for `CUSTOMER.DISPUTE.*`, set `PAYPAL_WEBHOOK_ID` to enforce signature verification.

## How it works

1. **Detect** — Sync or webhook (`CUSTOMER.DISPUTE.CREATED`) pulls the dispute: reason, amount, `seller_response_due_date`, requested `evidences[].evidence_type`.
2. **Decide** — Win odds from visible factors (delivered tracking +32, refund on file +30, missing proof −25…); `EV = odds × amount − fee`. Recommendation: contest only when EV > 0.
3. **Build evidence** — Checklist mapped per reason: `PROOF_OF_FULFILLMENT` (carrier + tracking), `PROOF_OF_REFUND` (refund ID), `OTHER` (note, listing text, policy) + document uploads. Contest is blocked while required items are missing. The exact JSON payload is previewed before sending.
4. **Approve** — Seller confirms in a modal that shows precisely what will be sent. Nothing money-moving happens without it.
5. **Submit & track** — Real PayPal response (status, debug ID) is stored; case moves to Under review. Seller records the final outcome; metrics update truthfully.

## API

| Endpoint | Does |
|---|---|
| `GET/POST /api/disputes` | List (filter/search) / create a manual case |
| `GET/PATCH/DELETE /api/disputes/[id]` | Read / update evidence facts / delete local copy |
| `POST /api/disputes/[id]/decide` | Rules decision, or validated LLM decision when configured |
| `GET /api/disputes/[id]/evidence` | Checklist + exact `provide-evidence` payload preview |
| `POST /api/disputes/[id]/submit` | `contest` (multipart w/ files) · `accept` · `offer` · `message` → PayPal, or honest 409/422 |
| `POST /api/disputes/[id]/outcome` | Record won/lost/accepted — drives metrics |
| `GET /api/paypal/status` · `POST /api/paypal/sync` | Live connection test / pull all disputes (paginated) |
| `POST /api/webhooks/paypal` | Verified, deduped dispute events → upsert |
| `GET /api/metrics` · `GET /api/activity` | Outcome-based metrics / audit trail + submissions |

## Tools

Next.js 16 (App Router), AG Grid (queue: React cell renderers, quick search, filters, CSV export), Render (`render.yaml`). Prompts versioned in `/prompts`.

## Demo (3:00)

0:00 the missed-deadline problem → 0:20 load samples (or sync sandbox) and open the $240 INR case → 1:00 decision factors + EV, edit the seller note → 1:40 approve → real `provide-evidence` response → 2:30 queue, outcomes, recovered money.

## Production notes

Swap the JSON store for Postgres behind `src/lib/db.ts` (single seam), add seller auth, and attach a persistent disk (Render: set `DATA_DIR` to the disk mount). PayPal calls already handle token caching, pagination, `debug_id` surfacing, and live/sandbox switching via `PAYPAL_ENV`.

## License

MIT — see LICENSE.
