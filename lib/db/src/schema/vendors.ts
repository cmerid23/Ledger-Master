import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { accountsTable } from "./accounts";
import { jobsTable } from "./jobs";
import { transactionsTable } from "./transactions";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  accountNumber: text("account_number"),
  paymentTerms: integer("payment_terms").default(30),
  defaultExpenseAccountId: integer("default_expense_account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  billNumber: text("bill_number"),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("unpaid"),
  // unpaid | partial | paid | overdue | cancelled
  billDate: text("bill_date"),
  dueDate: text("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const billLineItemsTable = pgTable("bill_line_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const billPaymentsTable = pgTable("bill_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Vendor = typeof vendorsTable.$inferSelect;
export type Bill = typeof billsTable.$inferSelect;
export type BillLineItem = typeof billLineItemsTable.$inferSelect;
export type BillPayment = typeof billPaymentsTable.$inferSelect;
