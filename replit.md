# ClearLedger — Full-Stack Accounting Application

## Overview

ClearLedger is a full-stack, multi-business accounting web application built as a pnpm workspace monorepo.

## Features

- **Public Landing Page** — premium marketing homepage at `/` with hero, features grid, pricing tiers, testimonials, about, CTA banner, and footer; dark navy + emerald green design; Framer Motion scroll animations; demo modal; mobile hamburger nav
- **Customers (CRM)** — customer directory with contact info (email, phone, address, city/state/zip), payment terms, notes; add/edit/delete with search; `customers` DB table
- **Invoices** — full invoice lifecycle (draft → sent → viewed → partial → paid → overdue → cancelled); line item editor with qty/unit/rate/amount auto-calc; tax rate %, discount $, subtotal/tax/total; customer linking; payment recording (amount, date, method, reference); convert quote → invoice; summary cards (outstanding, overdue, paid, drafts); `invoices`, `invoice_line_items`, `invoice_payments` DB tables
- **Quotes** — quote workflow (draft → sent → accepted → declined → expired → converted); line item editor identical to invoices; tax rate; one-click convert to invoice; `→ INV` badge on converted quotes; `quotes`, `quote_line_items` DB tables
- **Vendors** — vendor directory with contact info, account number, payment terms (Net X days), default expense account linking; bill summary per vendor (total billed, total owed, unpaid count); add/edit/delete; `vendors` DB table
- **Bills (AP)** — accounts payable bill lifecycle (unpaid → partial → paid → overdue → cancelled); line item editor with qty/rate/amount auto-calc and expense account assignment per line; tax rate % → auto-computed taxAmount and total; payment recording (amount, date, method, reference) with auto-recalculate of amountPaid/balanceDue/status; summary cards (total billed, outstanding, overdue, paid); status dropdown inline; `bills`, `bill_line_items`, `bill_payments` DB tables
- **Jobs** — job/project tracking for trucking and service businesses; statuses (active, completed, cancelled, on-hold); job types (route, load, contract, project, retainer, one-time); route fields (origin, destination, estimated/actual miles, rate-per-mile, flat rate); financial tracking (estimated vs actual revenue/cost, auto-computed profit and margin); expense management (15 trucking-specific categories: fuel_oil, tolls_scales, driver_pay, truck_lease, maintenance, tires, insurance, permits_licenses, dot_compliance, dispatch_fees, lumper_fees, parking_storage, communication, office_admin, professional_services) with per-expense add/delete that auto-recalculates job cost/profit; detail view with summary cards; list view with summary cards (active count, total revenue, total profit, avg margin); `jobs`, `job_expenses` DB tables
- **Fleet Management** — three-tab module (Vehicles | Mileage Logs | Fuel Logs); Vehicles: register trucks/vans with make/model/year/license plate/VIN/odometer start/fuel type, enriched with per-vehicle mileage+fuel totals; Mileage Logs: log trips by vehicle with odometer start/end (auto-computes miles), route, driver name, trip type (business/personal/medical/charity), IRS rate × miles = deduction value, year and vehicle filters, totals footer; Fuel Logs: log fuel purchases with station, US state, gallons, price per gallon (auto-computes total), odometer, IFTA-reportable flag, average $/gal, IFTA gallon tracking; all endpoints per-business ownership verified; `vehicles`, `mileage_logs`, `fuel_logs` DB tables
- **Multi-business support** — create and switch between businesses
- **Chart of Accounts (COA)** — full 46-account standard CoA (asset/liability/equity/income/cogs/expense); accounts have `normalBalance`, `subtype`, `isSystem`, `code` fields; auto-seeded on business creation; `POST /businesses/:id/seed-coa` to re-seed existing businesses
- **Bank Rules** — user-defined auto-categorization rules (contains/starts_with/ends_with/equals/greater_than/less_than); CRUD + test endpoint; `bank_rules` DB table
- **Auto-Categorization** — 15-category keyword-based engine runs on bank statement parse; checks bank rules first (highest priority), then 100+ keywords; returns `suggestedAccountId`, `suggestedAccountName`, `suggestedBy`, `suggestedConfidence` per transaction
- **Double-Entry Accounting Engine** — `AccountingEngine` class at `src/engine/accounting.ts`; `postBankTransaction` creates balanced journal entries (debit expense/income + credit/debit bank account) automatically on upload confirm; `validateEntry` enforces debit=credit balance
- **Bank Statement Upload** — per-transaction category dropdown pre-filled with auto-suggestions + confidence badge (rule/auto/guess %); "Apply all suggestions" button; rows highlighted amber when uncategorized; success screen shows journal entries posted count
- **Transactions** — debit/credit transactions, bulk categorization, pagination, search/filter
- **Journal Entries** — double-entry bookkeeping with balanced line validation
- **Bank Reconciliation** — match bank statements with journal entries
- **Financial Reports** — Profit & Loss (income / COGS / gross profit + margin / operating expenses / net profit + margin), Balance Sheet, Trial Balance with CSV export; P&L reads from journal_lines as source of truth; falls back to unassigned transactions for cash-basis view
- **Dashboard** — summary cards (revenue, expenses, net profit, cash balance) + revenue vs expenses chart (Recharts)
- **Settings** — update business name, currency, fiscal year start; manage multiple businesses
- **Receipts** — upload receipts (multipart via `POST /api/receipts/upload`), attach to transactions, manage metadata (vendor, amount, date, category, notes, tax-deductible flag), ZIP export by tax year
- **ReceiptDrawer** — slide-in drawer on Transactions page triggered by paperclip icon per row; drag-and-drop or click-to-upload dropzone, thumbnail grid (lightbox for images, new tab for PDFs), inline edit form per receipt, confirmation delete, tax-deductible toggle, green/grey paperclip badge showing count
- **Time Tracking** — log billable/non-billable hours with description, date, rate/hr (auto-calculates amount), link to customer and job; summary cards for total hours, unbilled hours, total earned, unbilled amount; billed/unbilled status; full CRUD; `time_entries` DB table
- **Proposals** — create proposals with line items, tax, discount; status workflow (draft → sent → viewed → accepted → declined → expired); one-click convert accepted proposal to invoice; `proposals`, `proposal_line_items` DB tables
- **Recurring Billing** — create recurring invoice schedules (weekly/biweekly/monthly/quarterly/yearly); auto-generates invoice on "Run now" or scheduled runs; configurable due-after-days, customer linking, auto-send option; pause/resume schedules; `recurring_schedules` DB table
- **Client Portal** — public invoice view page at `/portal/:token`; send clients a shareable link; shows invoice details, line items, payment history, totals; marks invoice as "viewed" on first open; no auth required
- **AI Tools** — smart transaction categorizer (keyword-based, maps to COA categories); quick invoice parser (parse plain-text item descriptions into invoice line items); category confidence scores
- **Developer API** — API key management; generate/revoke keys with scopes (read / read+write / admin); keys hashed before storage, raw key shown only once; quick reference for available endpoints; `api_keys` DB table

## Architecture

### Artifacts

- `artifacts/clearledger` — React + Vite frontend (port assigned by Replit)
- `artifacts/api-server` — Express 5 API server (port 8080)

### Packages

- `lib/db` — Drizzle ORM schema (PostgreSQL), tables: users, businesses, accounts, transactions, journal_entries, journal_lines, reconciliations, reconciliation_matches, receipts
- `lib/api-spec` — OpenAPI specification (`openapi.yaml`)
- `lib/api-client-react` — Orval-generated React Query hooks + Zod schemas

### Auth

- JWT tokens (jsonwebtoken + bcryptjs)
- Token stored in localStorage as `clearledger_token`
- Business ID stored as `clearledger_business_id`
- `setAuthTokenGetter` configured in `artifacts/clearledger/src/lib/auth.ts`
- JWT secret: `JWT_SECRET` env var or fallback

### Frontend Routing

- Vite proxies `/api/*` requests to `localhost:8080` (API server)
- Wouter for client-side routing
- Protected routes redirect to `/login` if no token
- After login, if no business selected, shows SelectBusiness page

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **Frontend**: React 19, Vite 7, Tailwind CSS v4, Recharts, Wouter
- **Backend**: Express 5, JWT, bcryptjs
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS)

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — typecheck + build all
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev)

## Important Files

- `lib/api-spec/openapi.yaml` — OpenAPI spec (40+ endpoints)
- `lib/db/src/schema/index.ts` — Drizzle DB schema
- `artifacts/api-server/src/routes/index.ts` — all API routes
- `artifacts/clearledger/src/App.tsx` — frontend routes/auth guard
- `artifacts/clearledger/src/components/Layout.tsx` — sidebar nav + business switcher
- `artifacts/clearledger/vite.config.ts` — includes `/api` proxy to port 8080
