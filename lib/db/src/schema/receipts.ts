import { pgTable, text, serial, integer, boolean, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { transactionsTable } from "./transactions";

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),         // object storage path e.g. /objects/uploads/uuid
  fileType: text("file_type"),                 // image/jpeg, image/png, application/pdf
  fileSizeBytes: integer("file_size_bytes"),
  vendorName: text("vendor_name"),
  receiptAmount: numeric("receipt_amount", { precision: 12, scale: 2 }),
  receiptDate: text("receipt_date"),           // ISO date YYYY-MM-DD
  expenseCategory: text("expense_category"),   // Travel, Meals, Office Supplies, etc.
  taxDeductible: boolean("tax_deductible").notNull().default(true),
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true, uploadedAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
