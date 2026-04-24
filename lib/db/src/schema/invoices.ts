import { pgTable, text, serial, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { accountsTable } from "./accounts";
import { transactionsTable } from "./transactions";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | sent | viewed | partial | paid | overdue | cancelled
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  terms: text("terms"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringInterval: text("recurring_interval"), // monthly | weekly | quarterly
  nextInvoiceDate: text("next_invoice_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  publicToken: text("public_token"),
});

export const invoiceLineItemsTable = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit"), // load | mile | hour | day | job | flat
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),
  paymentMethod: text("payment_method"), // cash | check | bank transfer | card
  reference: text("reference"),
  notes: text("notes"),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItemsTable).omit({ id: true });
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InvoiceLineItem = typeof invoiceLineItemsTable.$inferSelect;

export const insertInvoicePaymentSchema = createInsertSchema(invoicePaymentsTable).omit({ id: true, createdAt: true });
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;
