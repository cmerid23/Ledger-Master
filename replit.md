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
- **Chart of Accounts (COA)** — hierarchical accounts with type (asset/liability/equity/income/expense), auto-seeded with 27 standard accounts on business creation
- **Transactions** — debit/credit transactions, bulk categorization, pagination, search/filter
- **Journal Entries** — double-entry bookkeeping with balanced line validation
- **Bank Reconciliation** — match bank statements with journal entries
- **Financial Reports** — Profit & Loss, Balance Sheet, Trial Balance with CSV export
- **CSV Upload** — smart import of bank statements with auto-detect of date/amount columns
- **Dashboard** — summary cards (revenue, expenses, net profit, cash balance) + revenue vs expenses chart (Recharts)
- **Settings** — update business name, currency, fiscal year start; manage multiple businesses
- **Receipts** — upload receipts (multipart via `POST /api/receipts/upload`), attach to transactions, manage metadata (vendor, amount, date, category, notes, tax-deductible flag), ZIP export by tax year
- **ReceiptDrawer** — slide-in drawer on Transactions page triggered by paperclip icon per row; drag-and-drop or click-to-upload dropzone, thumbnail grid (lightbox for images, new tab for PDFs), inline edit form per receipt, confirmation delete, tax-deductible toggle, green/grey paperclip badge showing count

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
