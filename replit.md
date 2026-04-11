# ClearLedger — Full-Stack Accounting Application

## Overview

ClearLedger is a full-stack, multi-business accounting web application built as a pnpm workspace monorepo.

## Features

- **Multi-business support** — create and switch between businesses
- **Chart of Accounts (COA)** — hierarchical accounts with type (asset/liability/equity/income/expense), auto-seeded with 27 standard accounts on business creation
- **Transactions** — debit/credit transactions, bulk categorization, pagination, search/filter
- **Journal Entries** — double-entry bookkeeping with balanced line validation
- **Bank Reconciliation** — match bank statements with journal entries
- **Financial Reports** — Profit & Loss, Balance Sheet, Trial Balance with CSV export
- **CSV Upload** — smart import of bank statements with auto-detect of date/amount columns
- **Dashboard** — summary cards (revenue, expenses, net profit, cash balance) + revenue vs expenses chart (Recharts)
- **Settings** — update business name, currency, fiscal year start; manage multiple businesses

## Architecture

### Artifacts

- `artifacts/clearledger` — React + Vite frontend (port assigned by Replit)
- `artifacts/api-server` — Express 5 API server (port 8080)

### Packages

- `lib/db` — Drizzle ORM schema (PostgreSQL), tables: users, businesses, accounts, transactions, journal_entries, journal_lines, reconciliations
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
