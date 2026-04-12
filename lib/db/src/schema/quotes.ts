import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { invoicesTable } from "./invoices";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  quoteNumber: text("quote_number").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | sent | accepted | declined | expired | converted
  issueDate: text("issue_date").notNull(),
  expiryDate: text("expiry_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  terms: text("terms"),
  convertedToInvoiceId: integer("converted_to_invoice_id").references(() => invoicesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteLineItemsTable = pgTable("quote_line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit"),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

export const insertQuoteLineItemSchema = createInsertSchema(quoteLineItemsTable).omit({ id: true });
export type InsertQuoteLineItem = z.infer<typeof insertQuoteLineItemSchema>;
export type QuoteLineItem = typeof quoteLineItemsTable.$inferSelect;
