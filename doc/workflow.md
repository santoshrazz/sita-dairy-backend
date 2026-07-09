# Sita Dairy — Application Workflow

This document traces the actual request-level logic of the backend: what happens, in what order, for each business flow. See [`CLAUDE.md`](../CLAUDE.md) for file-level architecture; this file is about _behavior_.

All endpoints are mounted under `/api/v1/*`. Every response follows `{ success, message, ...data }`; every failure goes through `next(new ApiError(message, statusCode))` → the global `errorHandler`.

## 1. Authentication & session

There is **no separate login/register flow with email/password chosen by the user** — accounts are provisioned by an admin and the initial password is derived from the phone number.

- `POST /user/create` (`handleCreateUser`)
  - Requires `name`, `mobile`. Rejects if a user with that `mobile` already exists.
  - Password is auto-set to `mobile.slice(0, 5)` (first 5 digits of the phone number) and hashed by the `userSchema.pre("save")` hook (bcryptjs).
  - Returns a JWT (`generateAuthToken`, signed with `JWT_SECRET_KEY`, **no expiry set**) plus a trimmed user object.
- `POST /user/login` (`handleLoginUser`)
  - Looks up by `mobile`, compares `password` via `comparePassword`, returns a fresh JWT.
- `POST /user/create-seller` (`createSeller`, admin-only) — same auto-password pattern, forces `role: "Buyer"`. Used by admins to onboard buyers/sellers without going through public signup.

Every protected route runs two middlewares in sequence (`src/middleware/userVerify.middeware.js`):

1. `verifyUserToken` — reads `Authorization: Bearer <token>` (or `req.cookie.token`, though cookies aren't actually set anywhere), verifies the JWT, sets `req.user = { id, _id }`. No user lookup happens here — the token is trusted as-is.
2. `isAdmin` — re-fetches the user by `req.user._id` and checks `role === "Admin"`. Used to gate admin-only endpoints. Note: if the role check fails, execution still falls through without an explicit `return` in one code path context elsewhere in the codebase — but in `isAdmin` itself the `else` branch does `return next(...)` correctly.

There's no logout/token-revocation or refresh-token mechanism — a JWT is valid indefinitely once issued.

## 2. User roles & data model

One collection (`userModal`, in `customer.modal.js`) represents every actor. `role` is one of `User`, `Admin`, `Buyer`, `Farmer`, and drives all authorization plus filtering logic (e.g. `dashboardData` and `getMilkEntriesByUser` branch on whether the caller is `Admin` vs. `Farmer`/`Buyer`/`User`).

Each user also carries a running ledger balance: `walletAmount` (Number, default 0), guarded by `allowNegativeBalance` (Boolean, default false — if false, any debit that would push the balance below zero is rejected). Only `User`/`Farmer`/`Buyer` roles hold a meaningful balance in practice; `Admin` accounts never debit/credit through the normal flows, though the field exists on every document. See §5 for how the wallet actually moves.

Profile fields relevant to workflow: `preferedShift` (`Morning`/`Evening`/`Both`, used for shift-based filtering), `positionNo` (manual ordering, see §6), `latitude`/`longitude` (stored as strings), `status` (soft-delete/deactivation flag — `false` means the account is disabled but not removed).

- `PUT /user/update` — self-service or admin-driven profile edit. Accepts an optional `profilePic` file (multer, in-memory) which is uploaded to Cloudinary before the user doc is patched. Only whitelisted fields are ever written (name, mobile, fatherName, address, morningMilk, eveningMilk, milkRate, status, gender, latitude, longitude, preferedShift) — arbitrary body fields are ignored.
- `DELETE /user/delete-account` — does **not** delete the document; it sets `status: false` (soft delete/deactivate).
- `PUT /user/change-password` (admin-gated) — requires the _admin's own_ `oldPassword`/`newPassword`; oddly this is used to let an admin change their own password, not a target user's.

## 3. Milk entry — the core daily operation

Milk is tracked as individual `milkModal` documents, one per `(user, date, shift, entryType)` combination. `entryType` distinguishes two independent sub-flows that share the same collection:

- `entryType: "Buy"` — dairy buys milk _from_ a farmer.
- `entryType: "Sell"` — dairy sells milk _to_ a customer/buyer.

### 3a. Buy flow (`createMilkEntry`, admin-only)

1. Validate `weight`, `price`, `snf`, `shift`, `rate`, `userId`, `date`, `fat` are all present.
2. Guard against duplicates: look up existing `milkModal` docs for the same `byUser` + `date` + `shift` (note: this duplicate check does **not** filter by `entryType`, so in principle a `Buy` entry check can collide with a `Sell` entry for the same date/shift/user — see §11).
3. Inside one Mongo transaction: create the entry with `entryType: "Buy"`, then credit the farmer's wallet via `applyMilkWalletEffect` (`walletAmount += price`) and append a `MilkBuy`/`Credit` row to `walletTransactionModal` (`refType: "milk"`, `refId`: the entry's `_id`). If the wallet step throws, the whole transaction aborts and no entry is persisted.
4. Editing (`updateMilkEntry`) and deleting (`deleteMilkEntry`) keep the ledger in sync — see §5.

### 3b. Sell flow (`sellMilk`, admin-only)

Mirrors the Buy flow but:

- Required fields are `weight`, `price`, `shift`, `rate`, `userId`, `date` (no `snf`/`fat` requirement).
- Debits the customer's wallet (`walletAmount -= price`, `MilkSell`/`Debit` row) instead of crediting it. Guarded by `allowNegativeBalance`: if the buyer's balance would go negative and the flag is `false`, the whole request (entry + wallet) is rejected with `400` ("Insufficient wallet balance for this sale. Enable allowNegativeBalance for this customer or have them top up first.").

### 3c. Reading entries (`getMilkEntriesByUser`, `getSellMilkEntriesByUser`)

- Non-admin callers (`Farmer`/`Buyer`/`User` roles) are always forced to see only their own entries — the `userId` query param is overridden with `req.user._id` for them. Admins can pass any `userId` (or omit it to see everyone).
- Supports filtering by a single `date` (defaults to today), a `startDate`/`endDate` range, `shift`, and `entryType` (defaults to `"Buy"` for the buy-side endpoint; the sell-side endpoint hardcodes `entryType: "Sell"`).
- Results are populated with the user's `name`, `id`, `profilePic` and sorted newest-first by `date`.

## 4. Milk _orders_ (separate from milk _entries_)

`orderModal` is a distinct, simpler collection used for **request-to-sell** placed by a customer (e.g. "I have 20L to sell, please schedule pickup"), not the settled entry itself.

- `POST /milk/order` or `/user/order` (self-service) — customer submits `date`, `weight`, `contact`. Blocked if a `Pending` order already exists for that `contact` + `date` (though the guard has a bug — see §7). Starts life as `status: "Pending"`.
- `PUT /user/order` (admin-only, via `updateMilkOrderStatus`) — admin transitions `status` to `Approved` or `Rejected` via a query param.
- `GET .../order` — filterable by `userId`/`status`; admins can list any order, but note this endpoint has no self-service scoping (unlike milk entries, there's no forcing of `byUser = req.user._id` for non-admins here).
- `DELETE .../order` (admin-only) — hard delete.

Placing/approving an order **does not** create a `milkModal` entry — turning an approved order into an actual settled Buy/Sell entry is a manual, separate admin action (`createMilkEntry`/`sellMilk`).

## 5. Wallet & payments

The wallet is a `walletAmount` running balance on each user, backed by an append-only ledger (`walletTransactionModal`) so every balance change has a corresponding row. Full design/rationale lives in [`doc/payment-plan.md`](payment-plan.md); this section covers the request-level behavior.

Every wallet-affecting handler wraps its work in a Mongoose session/transaction (`mongoose.startSession()`), which requires the target MongoDB to be a replica set (or a sharded cluster) — a bare standalone `mongod` will throw on `startTransaction()`. MongoDB Atlas clusters are replica sets by default; a local `mongod` for dev needs `--replSet` enabled.

**Exactly four ledger sources** move the balance — `MilkBuy`, `MilkSell`, `CashPayment`, `Top-up` — each row records `direction` (`Credit`/`Debit`), `amount`, `status` (`Pending`/`Success`/`Failed`), `balanceAfter`, and an optional `refType`/`refId` back to what caused it.

All balance mutations go through `applyWalletDelta` (`src/utils/wallet.js`), an atomic guarded `findOneAndUpdate` with `$expr` checking `allowNegativeBalance === true OR walletAmount + delta >= 0`; if neither holds, it throws `ApiError("Insufficient wallet balance", 400)` and the caller's transaction rolls back. Passing `force: true` (used only for reversals, see below) skips the guard, since a compensating row must always apply even if it dips the balance negative.

### 5a. Milk-driven wallet effects (§3 recap)

- **Create** (`createMilkEntry`/`sellMilk`): entry + wallet delta + ledger row all commit in one Mongo transaction via `applyMilkWalletEffect`.
- **Update** (`updateMilkEntry`/`updateSellMilkEntry`): if `price` or `userId` (the payer/payee) changes, the handler first reverses the *original* effect (`reverseMilkWalletEffect`, `force: true` — a correction always applies) and then reapplies the new amount against the new user (guarded normally, so a bad edit that would overdraw is rejected and the whole update — patch included — is rolled back).
- **Delete** (`deleteMilkEntry`/`deleteSellMilkEntry`): reverses the entry's wallet effect (`force: true`), then hard-deletes the doc, in one transaction.
- All three reuse `milkEntrySignedAmount(entry)` (`entryType === "Buy" ? +price : -price`) so the sign logic lives in one place.

### 5b. Cash payments (admin manual adjustment)

- `POST /wallet/cash-payment` (admin-only, `recordCashPayment`): body `{ userId, amount, direction: "Credit"|"Debit", note? }`. One endpoint handles both directions — e.g. `Credit` when a buyer pays cash, `Debit` when a farmer is paid out in cash. There's no separate "adjustment" source; a correction is just another `CashPayment` row. `Debit` is guarded by `allowNegativeBalance` the same way a Sell entry is; `Credit` isn't (adding money can't overdraw).

### 5c. Wallet statement (replaces the old `paymentReport`)

- `GET /wallet/statement` (`getWalletStatement`): non-admin callers are forced to their own `req.user._id`; admins can pass any `userId` (or omit it to see all). Filterable by `startDate`/`endDate` (matched against `createdAt`), `source`, `status`; paginated via `page`/`limit`. Returns the rows plus `totalCount` and a `totalAmount` (Credits minus Debits over the returned page, not the whole ledger).

### 5d. UPI top-up (PhonePe Standard Checkout v2)

Self-service flow for a buyer/farmer/user to add money via UPI. Uses the official `@phonepe-pg/pg-sdk-node` SDK (`src/utils/phonepe.js`) — no hand-rolled HTTP calls to PhonePe.

1. `POST /wallet/upi-topup/initiate` (self, `initiateUpiTopUp`): validates `WALLET_TOPUP_MIN <= amount <= WALLET_TOPUP_MAX`, generates a `merchantOrderId` (nanoid), creates a `Top-up`/`Pending` ledger row, then calls PhonePe's `pay()` to get a `redirectUrl`. If PhonePe's API call itself fails, the ledger row is marked `Failed` and the error is surfaced to the caller — it's never left dangling as `Pending`.
2. `POST /wallet/upi-topup/webhook` (no auth middleware — PhonePe's signed callback *is* the auth): validates the `Authorization` header via `client.validateCallback(username, password, header, rawBody)` (raw body captured verbatim by `express.json({ verify })` in `app.js`, since the signature is computed over the exact bytes, not a re-serialized object). On a valid callback, looks up the ledger row by `gateway.merchantOrderId` and reconciles it. Always responds `200` — even on a validation failure — because PhonePe retries non-2xx responses and a transient error shouldn't trigger a retry storm; failures are logged server-side instead.
3. `POST /wallet/upi-topup/:merchantOrderId/reverify` (owner or admin, `reverifyUpiTopUp`): fallback for a stuck/missed webhook. No-ops if the row is already `Success`/`Failed`; otherwise calls PhonePe's `getOrderStatus` and reconciles.
4. Reconciliation (`reconcilePhonePeOrder`, shared by both webhook and reverify) is idempotent — it only acts on rows still `Pending`, so a webhook/reverify race can't double-credit. On `state: "COMPLETED"` it credits the wallet (unguarded — a top-up can't overdraw) and flips the row to `Success` with `balanceAfter`; on `"FAILED"` it flips to `Failed` with a `failureReason`; `"PENDING"` is left untouched.
5. No refund handling and no polling cron — explicitly out of scope per the plan; the reverify endpoint is the only reconciliation path besides the webhook.

## 6. Admin bulk operations

- `POST /user/change-user-role` (`changeUserRole`) — body carries `users` as a **JSON string** (`JSON.parse(req.body.users)`, presumably because this endpoint also accepts multipart/form-data elsewhere in the app's conventions), each `{ customerId, role }`; applies role changes in parallel via `Promise.all`.
- `POST /user/change-position` (`changeUserPosition`) — body carries a plain array `users: [{ userId, positionNo }]`, applied sequentially. Used to let admins manually reorder the customer list (`positionNo`) — e.g. drag-and-drop ordering in the app UI.

## 7. Dashboard aggregation

`GET /user/dashboard` (`dashboardData`) computes different summaries depending on the caller's role, all derived by scanning `milkModal` with in-memory `reduce`/`parseFloat` (no MongoDB aggregation pipeline):

- **Admin view**: `totalCustomers` (non-admin user count), this month's and today's total earnings/milk weight _across all users_, and the 5 most recent entries platform-wide (populated with `byUser`).
- **Non-admin view**: the same monthly/today totals but scoped to `byUser: userId`, plus `todaysFatValues`/`todaysSnfValues` arrays (raw per-entry fat/SNF numbers for today, likely for charting) and their own last 5 entries.

Because `weight`/`price`/`fat`/`snf` are stored as `String` on the schema, every aggregation here re-parses them with `parseFloat` at read time rather than querying numerically in Mongo.

## 8. Products

Independent of milk logic — a simple catalog:

- `GET /product/all` — returns only `isFeatured: true` products (any authenticated user).
- `POST /product/create` / `PUT /product/update/:id` (admin-only) — optional `thumbnail` file uploaded to Cloudinary the same way profile pictures are.
- `DELETE /product/delete/:id` (admin-only) — hard delete.

There is no purchase/checkout flow connecting products to orders yet — `buyerCount` exists on the schema but nothing in the current controllers increments it.

## 9. Rate chart (Fat/SNF pricing table)

`ratechartModal` holds one row per `fat` percentage with a fixed set of SNF-band columns (`snf8_0` … `snf8_5`), used by the front-end/DPU workflow to look up the milk price for a given fat/SNF reading.

- `GET /ratechart` (admin-only) — returns the rows plus a `column` metadata array describing the editable grid shape (label/type per column) — the response is shaped for a spreadsheet-like UI.
- `PUT /ratechart/:id` (admin-only) — upserts a row (`upsert: true`), so this same endpoint both edits an existing fat-band row and creates a new one if the `id` doesn't resolve to an existing document.

Per `features.txt`, an Excel-upload replacement for this manual grid is a planned but unimplemented feature.

## 10. General / dropdown lookups

`POST /general/dropdown` (admin-only) is a generic, extensible lookup endpoint keyed by a `code` field in the body:

- `code: "USERS"` — returns users filtered by `status: true` and optionally `preferedShift` (`shift`), a specific `_id` (`userId`), or `role` (defaulting to "everyone except Admin" when no role is given). Used to populate customer picker dropdowns (e.g. shift-filtered farmer lists for the milk entry screen).
- Any other `code` currently just returns a bare success response — the endpoint is a stub designed to grow additional `code` branches over time.

## 11. Known rough edges (observed while tracing the code, not filed as tickets)

- The duplicate-entry guard in `createMilkEntry`/`sellMilk` checks `byUser + date + shift` but the Buy-side check omits `entryType`, so it can't distinguish a same-day Buy vs. Sell duplicate purely by that query (mitigated in practice because `sellMilk`'s own check does include `entryType: "Sell"`, but the asymmetry is worth knowing about).
- `createMilkOrder`'s duplicate-pending check calls `next(new ApiError(...))` without `return`, so execution continues and a duplicate order can still be created even when the guard "fires."
- JWTs never expire and there's no revocation list — a leaked token is valid forever.
- `src/middleware/validator.js` (Joi-based) is not mounted anywhere and references undefined symbols; no request body validation actually runs beyond the manual `if (!field)` checks inside each controller.
- Wallet ledger reversals (`reverseMilkWalletEffect` on milk update/delete) always tag the compensating row with `refType: "milk"` pointing at the milk entry's own `_id`, not at the specific prior ledger row being reversed — simpler to compute (derived straight from the milk doc's stored `price`/`entryType` before the patch overwrites them) but means the statement view can't distinguish "the original credit" from "a correction" for a given milk entry without also checking `direction`/order.
- PhonePe UPI top-up has not been exercised against a real sandbox transaction yet — the webhook/reverify field-matching (`payload.merchantOrderId`, `state` values `COMPLETED`/`FAILED`/`PENDING`) is taken from the installed `@phonepe-pg/pg-sdk-node` v2.0.6 type definitions, not a live callback. Run the manual sandbox pass in `doc/payment-plan.md` Phase 4 before trusting this path in production.
