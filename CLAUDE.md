# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sita Dairy backend — an Express 5 + MongoDB (Mongoose) REST API for a dairy management system (milk collection/sales, rate charts, products). Runs both as a normal long-lived Node server and as an AWS Lambda function behind API Gateway (via `serverless-http`).

Note: the previous wallet/payment feature (`walletAmount` on the user model, the `payment` resource) has been removed and is being redesigned — do not reintroduce `walletAmount` increments/decrements or a `payment.*` route/controller/model without new direction, and treat any lingering mentions elsewhere as stale until the new flow lands.

## Commands

```bash
npm run start:dev   # run locally with nodemon (reads .env, listens on PORT or 5002)
npm start            # run locally with plain node
npm run dev          # run via `serverless offline` (simulates Lambda/API Gateway, port 8081 per serverless.yml)
```

There is no test suite configured (`npm test` is a stub) and no lint/format script — do not assume ESLint/Prettier tooling exists.

Environment variables (set in `.env`, loaded via dotenv): `MongoDbURI`, `JWT_SECRET_KEY`, `CLOUDINERY_CLOUD_NAME`, `CLOUDINERY_API_KEY`, `CLOUDINERY_API_SECRET`, `PORT`.

Deployment: `serverless.yml` deploys `src/index.handler` to AWS Lambda (region `ap-south-1`). Note `src/index.js` currently runs `app.listen(...)` directly and has the `serverless-http` handler export commented out — the two run modes are not simultaneously wired up, so check which mode is intended before changing `src/index.js`. GitHub Actions workflows for deploy exist but are disabled (`.github/workflows/*.disabled`). Docker image build is defined in `docker/Dockerfile` (exposes 8081, runs `npm start`).

## Architecture

Standard layered Express structure, all ES modules (`"type": "module"` in package.json):

- `src/index.js` — entry point: loads env, connects to DB, starts the HTTP server (or, when re-enabled, exports the Lambda `handler`).
- `src/app.js` — builds the Express app: JSON/urlencoded body parsing, CORS (open, `origin: "*"`), `express-rate-limit` (100 req / 10 min), and mounts all routers under `/api/v1/*`. The global `errorHandler` middleware is registered last.
- `src/db/connectToDb.js` — single Mongoose connection setup; exits the process on connection failure.
- `src/routes/*.route.js` — one router per resource (`user`, `milk`, `product`, `ratechart`, `general`), composed of `verifyUserToken` / `isAdmin` middleware chains plus optional `multer` upload middleware for file fields.
- `src/controllers/*.controller.js` — request handlers, one file per resource. All handlers follow the same pattern: try/catch, `next(new ApiError(message, statusCode))` on failure, and `res.status(...).json({ success, message, ...data })` on success. Note `user.controller.js` also contains milk-order handlers (`createMilkOrder` etc. are actually in `milk.controller.js` — check imports carefully, some order/milk logic crosses between `user` and `milk` routes).
- `src/models/*.modal.js` — Mongoose schemas (note the `.modal.js` filename suffix is used throughout, not `.model.js`). Models guard against re-registration with `mongoose.models.x || mongoose.model(...)` (important for serverless cold-start reuse). Key models: `customer.modal.js` (`userModal` — the sole "customer/user" collection, doubles as farmer/buyer/admin via `role` enum: `User`, `Admin`, `Buyer`, `Farmer`), `milk.modal.js` (entries typed via `entryType: Buy|Sell` and `shift: Morning|Evening`), `order.modal.js`, `ratechart.modal.js` (fat/SNF rate lookup table), `product.modal.js`, `bankDetails.modal.js` (currently unused by any controller/route — defined but not wired up).
- `src/middleware/userVerify.middeware.js` (note filename typo, kept as-is) — `verifyUserToken` decodes the JWT from `Authorization: Bearer <token>` into `req.user`; `isAdmin` then loads the user and checks `role === "Admin"`. Almost every admin-only route chains both.
- `src/middleware/errorHandler.middleware.js` — exports `ApiError` (Error subclass carrying an HTTP `status`) and the terminal `errorHandler` Express middleware that turns it into `{ success: false, message }`.
- `src/middleware/validator.js` — a Joi-based request validator keyed off the URL path; it is **not currently wired into `app.js` or any route** and references undefined identifiers (`ErrorHandler`, `BAD_GATEWAY`) — treat as dead/incomplete code, not an active part of the request pipeline.
- `src/utils/cloudinery.js` — wraps Cloudinary upload (buffer → hosted image URL), used for profile pictures and product thumbnails uploaded in-memory via `src/utils/multer.js` (`multer.memoryStorage()`, image-only file filter).

### Domain notes

- A single `user` collection represents everyone (admins, farmers/sellers, buyers) — role-based access is enforced entirely in middleware/controllers via the `role` field, not via separate collections or Mongoose discriminators.
- Money/weight/rate fields on `milk` and `order` schemas are stored as `String` (not `Number`) and parsed with `parseFloat`/`Number` in controllers when aggregated — keep this in mind when adding new numeric fields or aggregation logic.
- `features.txt` at the repo root is a running wishlist of planned/requested features (in Hinglish) from the product owner — useful background context on where the app is headed, but not implemented yet.
- `doc/workflow.md` traces actual request-level business logic (auth, milk entries vs. orders, dashboard aggregation, known rough edges) flow-by-flow — read it before changing behavior in `user`/`milk` controllers, since it documents intent and existing bugs that aren't obvious from the code alone.
