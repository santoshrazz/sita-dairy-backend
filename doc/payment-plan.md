# Wallet & Payment Integration — Implementation Plan

This is the authoritative task list for reintroducing wallet/cash/UPI payments. Work only from the tasks below — if something is missing or a decision needs to change, update this file first, then implement.

Supersedes the note in [`CLAUDE.md`](../CLAUDE.md) that says wallet/payment was "removed, pending redesign" — this doc **is** the new design. See [`workflow.md`](./workflow.md) for how it fits into existing request flows (to be updated as part of Phase 4).

## Decisions locked in for this plan

These came out of a Q&A round with the product owner — don't re-litigate them without checking in first:

1. **Wallet-holding roles**: `Buyer`, `Farmer`, `User`. `Admin` never holds a wallet.
2. **Milk entries move wallet balance automatically**:
   - `entryType: "Sell"` → **debits** the buyer's (`byUser`) wallet.
   - `entryType: "Buy"` → **credits** the farmer's (`byUser`) wallet.
   - Both are guarded by the user's `allowNegativeBalance` flag: if the resulting balance would go negative and the flag is `false`, the request is rejected (`400`) and no entry/wallet change is persisted.
3. **Exactly four ledger sources — no others**: `MilkSell`, `MilkBuy`, `CashPayment`, `Top-up`.
   - `CashPayment` is admin-only and two-directional (`direction: "Credit"` or `"Debit"`) — this is how an admin manually adjusts a balance, whether that's crediting a buyer who paid cash or debiting a farmer who was paid out in cash. There is no separate "adjustment" source; a correction is just another `CashPayment` row.
   - `Top-up` is the PhonePe UPI flow — an actual PhonePe transaction happens, not a manual entry.
4. **PhonePe integration**: **Standard Checkout v2** (OAuth `client_id`/`client_secret`, not the legacy salt-key checksum API). Sandbox/UAT credentials already exist.
5. **Redirect UX is out of scope for this backend plan** — PhonePe's `redirectUrl` will point at a placeholder backend-hosted page for now; the app team wires the real deep link later without backend changes.
6. **No polling cron.** Reconciliation is on-demand: an authenticated **reverify** endpoint re-checks a pending order against PhonePe's Order Status API. The webhook is the primary path; reverify is the fallback for stuck/pending transactions.
7. **Top-up limits**: ₹10 minimum, ₹5,000 maximum per transaction (configurable constants, not hardcoded magic numbers).
8. **No refund handling.** Explicitly dropped — a `Top-up` transaction never becomes a debit. If refunds are needed later, that's a separate future plan (would need its own source or a repurposed one, decide then).
9. **Wallet statement/history endpoint is in scope**, replacing the old `paymentReport`.

### Assumptions made while turning this into tasks (flag if wrong)

- **Reversal/delete of a milk entry bypasses the negative-balance guard** and reuses the *same* source (`MilkSell`/`MilkBuy`) with the direction flipped — there's no dedicated reversal source, since only 4 sources exist. The compensating row is a correction, not a new business debit, so it must always apply even if it pushes the balance negative. The guard only applies to *new* debits (a fresh Sell entry, or a `CashPayment` in the `Debit` direction).
- **Ledger is append-only.** Edits/deletes never mutate a past `walletTransaction` row — they add a compensating row (same source, opposite direction, linked via `refId`). This keeps the statement endpoint an honest audit trail.

If either of these doesn't match your intent, say so before Phase 1 starts and this file gets updated.

---

## Data model

### `src/models/walletTransaction.modal.js` (new)

One row per balance-affecting event. Never mutated after `status` leaves `Pending`.

| field | type | notes |
|---|---|---|
| `user` | ObjectId ref `user` | whose wallet this affects |
| `direction` | enum `Credit`/`Debit` | |
| `amount` | Number | always positive; `direction` gives sign |
| `source` | enum `MilkSell`, `MilkBuy`, `CashPayment`, `Top-up` | exactly these four, nothing else |
| `status` | enum `Pending`, `Success`, `Failed` | only `Top-up` ever starts `Pending`; the other three are always created as `Success` |
| `balanceAfter` | Number | snapshot at the moment `status` became `Success`; `null` while `Pending`/`Failed` |
| `refType` | enum `milk`, `walletTransaction`, `null` | what this row is tied to |
| `refId` | ObjectId | milk entry id, or the original transaction id (for a reversal row) |
| `createdBy` | ObjectId ref `user`, nullable | admin who recorded a `CashPayment`; null for milk-driven and self-service `Top-up` rows |
| `note` | String, optional | free text for `CashPayment` entries |
| `failureReason` | String, optional | set when `status: "Failed"` |
| `gateway` | subdocument, optional | only present for `Top-up`: `{ merchantOrderId, phonepeOrderId, rawInitResponse, rawCallback, verifiedAt }` |

Indexes: `{ user: 1, createdAt: -1 }`, unique sparse `{ "gateway.merchantOrderId": 1 }`.

### `src/models/customer.modal.js` (no schema change)

`walletAmount` (Number, default 0) and `allowNegativeBalance` (Boolean, default false) already exist — confirm they're present for all four roles and document them as load-bearing for this feature (currently undocumented).

### Env vars (add to `.env`, `serverless.yml` functions.api.environment, and the CLAUDE.md env list)

```
PHONEPE_CLIENT_ID=
PHONEPE_CLIENT_SECRET=
PHONEPE_CLIENT_VERSION=
PHONEPE_ENV=SANDBOX        # SANDBOX | PRODUCTION
PHONEPE_CALLBACK_USERNAME=  # configured in PhonePe dashboard for webhook auth
PHONEPE_CALLBACK_PASSWORD=
WALLET_TOPUP_MIN=10
WALLET_TOPUP_MAX=5000
```

---

## Endpoints (all new, under `/api/v1/wallet`)

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /wallet/cash-payment` | admin | Record a manual `CashPayment` (Credit or Debit) to adjust a balance |
| `GET /wallet/statement` | self or admin (any `userId`) | Paginated ledger, replaces old `paymentReport` |
| `POST /wallet/upi-topup/initiate` | self | Start a PhonePe UPI top-up, returns `redirectUrl` |
| `POST /wallet/upi-topup/webhook` | none (PhonePe signature-verified) | S2S callback from PhonePe |
| `POST /wallet/upi-topup/:merchantOrderId/reverify` | self (owner) or admin | On-demand reconciliation against PhonePe order-status API |

Milk entry endpoints (`/api/v1/milk/*`) keep their existing routes/contracts — only their controller bodies change (Phase 1).

---

## Phase 0 — Foundations

- [ ] Add the env vars above to `.env.example`/`.env`, `serverless.yml`, and the CLAUDE.md env var list.
- [ ] Create `src/models/walletTransaction.modal.js` per the schema above, following the existing `mongoose.models.x || mongoose.model(...)` guard convention.
- [ ] Create `src/utils/wallet.js` exporting:
  - `applyWalletDelta(userId, signedDelta, { session, force = false })` — atomic guarded update:
    ```js
    userModal.findOneAndUpdate(
      {
        _id: userId,
        ...(force ? {} : {
          $expr: {
            $or: [
              { $eq: ["$allowNegativeBalance", true] },
              { $gte: [{ $add: ["$walletAmount", signedDelta] }, 0] },
            ],
          },
        }),
      },
      { $inc: { walletAmount: signedDelta } },
      { new: true, session },
    )
    ```
    Throws `ApiError("Insufficient wallet balance", 400)` if the query returns `null` and `force` was `false`.
  - `recordWalletTransaction(data, { session })` — thin wrapper around `walletTransactionModal.create([data], { session })`, used by every code path below so the shape stays consistent.

## Phase 1 — Milk entries drive the wallet

- [ ] `createMilkEntry` (Buy) in `milk.controller.js`: wrap the existing doc creation in a Mongo session/transaction; call `applyWalletDelta(byUser, +price)` then `recordWalletTransaction({ source: "MilkBuy", direction: "Credit", refType: "milk", refId: entry._id, ... })`. Abort the transaction (and the milk entry) if the wallet step throws.
- [ ] `sellMilk` (Sell): same pattern with `applyWalletDelta(byUser, -price)` and `source: "MilkSell"`, `direction: "Debit"`. On `ApiError` from the guard, return `400` with a message telling the caller to enable `allowNegativeBalance` or top up first.
- [ ] `updateMilkEntry` / `updateSellMilkEntry`: when `price` or `byUser` changes, inside one transaction: (a) reverse the original ledger row's effect via `applyWalletDelta(oldUser, -oldSignedAmount, { force: true })` + a compensating row (same `source` — `MilkBuy`/`MilkSell` — with the direction flipped, `refId` pointing at the original), then (b) apply the new amount via the normal (non-forced) path against the new user. Reject the whole edit if step (b)'s guard fails.
- [ ] `deleteMilkEntry` / `deleteSellMilkEntry`: inside one transaction, reverse the original effect (`force: true`) with a compensating row (same rule as above), then hard-delete the milk doc.
- [ ] Add a small helper to compute the "original signed amount" for a milk doc (`entryType === "Buy" ? +price : -price`) so update/delete don't duplicate that branch.

## Phase 2 — Cash payments (admin balance adjustment)

- [ ] `src/controllers/wallet.controller.js`:
  - `recordCashPayment` (admin-only): body `{ userId, amount, direction, note }`. `direction: "Credit"` (e.g. buyer paid cash) or `"Debit"` (e.g. farmer paid out in cash) — same endpoint handles both. Uses `applyWalletDelta` (guard applies to `Debit` only) + `recordWalletTransaction({ source: "CashPayment", createdBy: req.user._id, note })`.
  - `getWalletStatement`: query `{ userId?, startDate?, endDate?, source?, status?, page?, limit? }`. Non-admin callers are forced to their own `req.user._id` (mirrors the existing pattern in `getMilkEntriesByUser`). Returns paginated rows plus a running total, replacing `paymentReport`.
- [ ] `src/routes/wallet.route.js`: wire the two routes above with `verifyUserToken` (+ `isAdmin` on `cash-payment`).
- [ ] Mount `walletRoute` in `app.js` under `/api/v1/wallet`.

## Phase 3 — PhonePe UPI top-up

- [ ] `src/utils/phonepe.js`:
  - `getAccessToken()` — OAuth token fetch against PhonePe's token endpoint using `PHONEPE_CLIENT_ID`/`SECRET`/`CLIENT_VERSION`; cache in memory with expiry, refresh when within a safety margin of expiring.
  - `createOrder({ merchantOrderId, amountPaise, redirectUrl })` — calls the v2 `/checkout/v2/pay` (or current equivalent) endpoint, returns `{ phonepeOrderId, redirectUrl }`.
  - `getOrderStatus(merchantOrderId)` — calls the v2 order-status endpoint, returns normalized `{ state, raw }`.
  - `verifyCallbackAuth(authHeader, rawBody)` — validates the webhook's `Authorization` header against `PHONEPE_CALLBACK_USERNAME`/`PASSWORD` per PhonePe v2 webhook auth (SHA256 of `username:password`, compared to the header).
- [ ] `initiateUpiTopUp` controller (self-service, any wallet-holding role): validate `WALLET_TOPUP_MIN <= amount <= WALLET_TOPUP_MAX`; generate a unique `merchantOrderId` (nanoid); create a `Pending` `walletTransaction` (`source: "Top-up"`, `direction: "Credit"`, `gateway.merchantOrderId`); call `createOrder(...)`; persist `gateway.phonepeOrderId` + `rawInitResponse`; respond with the `redirectUrl`.
- [ ] `reconcilePhonePeOrder(merchantOrderId, rawPayload)` shared function (in `phonepe.js` or `wallet.js`): loads the `walletTransaction` by `gateway.merchantOrderId`; **no-op if `status` is already `Success`/`Failed`** (idempotency for webhook-vs-reverify races); on `COMPLETED` → `applyWalletDelta(+amount)` + set `status: "Success"`, `balanceAfter`, `gateway.verifiedAt`; on any terminal failure state → set `status: "Failed"`, `failureReason`.
- [ ] `handlePhonePeWebhook` controller (public route): verify `verifyCallbackAuth`, reject `401` on mismatch, otherwise call `reconcilePhonePeOrder` with the callback body and always respond `200` (per PhonePe's retry semantics — don't 4xx/5xx a payload you've already processed).
- [ ] `reverifyUpiTopUp` controller (owner buyer or admin): only meaningful on a `Pending` row; calls `getOrderStatus`, then `reconcilePhonePeOrder`. Returns the resulting status.
- [ ] `src/routes/wallet.route.js`: add `initiate` (self), `webhook` (no auth middleware — signature is the auth), `:merchantOrderId/reverify` (self-owner check or admin).

## Phase 4 — Docs

- [ ] Update `CLAUDE.md`: replace the "wallet/payment removed, do not reintroduce" note with a short pointer to this file; add the new env vars; add `wallet.controller.js`/`wallet.route.js`/`walletTransaction.modal.js` to the architecture list.
- [ ] Update `doc/workflow.md` §5 ("Payments & wallet reconciliation — removed, pending redesign") with the real flow, matching the style of the other sections (endpoint-by-endpoint, called-out edge cases).
- [ ] Manual sandbox test pass (record results, don't just check the box blind):
  - [ ] Milk Sell debits buyer wallet; blocked with `400` when balance insufficient and `allowNegativeBalance: false`; allowed when `true`.
  - [ ] Milk Buy credits farmer wallet.
  - [ ] Editing a milk entry's price adjusts the wallet by the delta (reversal + reapply).
  - [ ] Deleting a milk entry reverses its wallet effect.
  - [ ] `CashPayment` Credit (e.g. buyer paid cash) and Debit (e.g. farmer paid out) via `/wallet/cash-payment`.
  - [ ] `/wallet/statement` pagination and filters.
  - [ ] UPI top-up: successful sandbox payment → webhook credits wallet.
  - [ ] UPI top-up: failed sandbox payment → `status: "Failed"`, no wallet change.
  - [ ] Reverify on a still-pending order after simulating a missed webhook.
