import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  proposalNumber: text("proposal_number").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | sent | viewed | accepted | declined | expired
  issueDate: text("issue_date").notNull(),
  expiryDate: text("expiry_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  terms: text("terms"),
  publicToken: text("public_token").unique(),
  convertedToInvoiceId: integer("converted_to_invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export const proposalLineItemsTable = pgTable("proposal_line_items", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposalsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit"),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const proposalsRelations = relations(proposalsTable, ({ many }) => ({
  lineItems: many(proposalLineItemsTable),
}));

export const proposalLineItemsRelations = relations(proposalLineItemsTable, ({ one }) => ({
  proposal: one(proposalsTable, { fields: [proposalLineItemsTable.proposalId], references: [proposalsTable.id] }),
}));

export const insertProposalSchema = createInsertSchema(proposalsTable).omit({ id: true, createdAt: true });
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposalsTable.$inferSelect;

export const insertProposalLineItemSchema = createInsertSchema(proposalLineItemsTable).omit({ id: true });
export type InsertProposalLineItem = z.infer<typeof insertProposalLineItemSchema>;
export type ProposalLineItem = typeof proposalLineItemsTable.$inferSelect;
