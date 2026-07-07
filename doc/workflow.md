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

> The user model previously carried a `walletAmount` running balance, reconciled by a `payment` resource (add-payment/payment-report/reset-payment). Both have been removed and are being redesigned — see the note at the end of this document. Nothing below reflects wallet/payment behavior anymore.

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
2. Guard against duplicates: look up existing `milkModal` docs for the same `byUser` + `date` + `shift` (note: this duplicate check does **not** filter by `entryType`, so in principle a `Buy` entry check can collide with a `Sell` entry for the same date/shift/user — see §10).
3. Create the entry with `entryType: "Buy"`.
4. Editing (`updateMilkEntry`) and deleting (`deleteMilkEntry`) are straight field patches / hard deletes by `_id`.

> Previously this flow also credited the farmer's wallet (`walletAmount += price`, via `$inc`). That side effect has been removed along with the payment feature — a milk Buy entry no longer moves any balance.

### 3b. Sell flow (`sellMilk`, admin-only)

Mirrors the Buy flow but:

- Required fields are `weight`, `price`, `shift`, `rate`, `userId`, `date` (no `snf`/`fat` requirement).
- Previously debited the customer's wallet (`walletAmount -= price`) — also removed; a Sell entry no longer moves any balance.

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

## 5. Payments & wallet reconciliation — removed, pending redesign

The wallet/payment feature (`walletAmount` on the user model, the `/api/v1/payment` routes, `paymentModal`, and the `$inc` side effects in the milk Buy/Sell flows above) has been deleted from the codebase. It is being redesigned and reimplemented from scratch — this section is intentionally left as a placeholder until the new flow lands. Do not assume any balance-tracking or payment-history behavior exists right now.

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
