import { db, accountsTable, journalEntriesTable, journalLinesTable, transactionsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";

export interface JournalLineInput {
  accountId: number;
  description?: string;
  debit: number;
  credit: number;
}

export class AccountingEngine {
  validateEntry(lines: JournalLineInput[]) {
    const totalDebits = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      throw new Error(`Journal entry out of balance: debits=${totalDebits.toFixed(2)} credits=${totalCredits.toFixed(2)}`);
    }
  }

  async postEntry(businessId: number, date: string, description: string, lines: JournalLineInput[], source = "manual", sourceId?: number): Promise<number> {
    this.validateEntry(lines);
    const [entry] = await db.insert(journalEntriesTable).values({
      businessId,
      date,
      memo: description,
    }).returning();
    for (const line of lines) {
      await db.insert(journalLinesTable).values({
        journalEntryId: entry.id,
        accountId: line.accountId,
        debitAmount: String(line.debit),
        creditAmount: String(line.credit),
      });
    }
    return entry.id;
  }

  // When a bank transaction is categorized:
  // Money IN (deposit): DR Bank Account, CR Income Account
  // Money OUT (payment): DR Expense Account, CR Bank Account
  async postBankTransaction(opts: {
    businessId: number;
    transactionId: number;
    date: string;
    description: string;
    amount: number; // positive = in, negative = out
    categoryAccountId: number; // the income/expense account
    bankAccountId?: number; // the bank GL account (defaults to system checking)
  }): Promise<number> {
    const { businessId, transactionId, date, description, amount, categoryAccountId, bankAccountId } = opts;

    // Find bank account in chart of accounts
    let bankGlAccountId = bankAccountId;
    if (!bankGlAccountId) {
      const [bankAcct] = await db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.code, "1010")))
        .limit(1);
      bankGlAccountId = bankAcct?.id;
    }
    if (!bankGlAccountId) {
      const [bankAcct] = await db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(and(eq(accountsTable.businessId, businessId), sql`${accountsTable.subtype} IN ('bank', 'checking')`))
        .limit(1);
      bankGlAccountId = bankAcct?.id;
    }
    if (!bankGlAccountId) {
      throw new Error("No bank account found in chart of accounts. Ensure account 1010 (Checking Account) exists.");
    }

    const abs = Math.abs(amount);
    let lines: JournalLineInput[];

    if (amount > 0) {
      // Money IN: DR Bank, CR Category (income)
      lines = [
        { accountId: bankGlAccountId, description, debit: abs, credit: 0 },
        { accountId: categoryAccountId, description, debit: 0, credit: abs },
      ];
    } else {
      // Money OUT: DR Category (expense), CR Bank
      lines = [
        { accountId: categoryAccountId, description, debit: abs, credit: 0 },
        { accountId: bankGlAccountId, description, debit: 0, credit: abs },
      ];
    }

    const entryId = await this.postEntry(businessId, date, description, lines, "bank_import", transactionId);

    // Link the journal entry back to the transaction
    await db
      .update(transactionsTable)
      .set({ accountId: categoryAccountId })
      .where(eq(transactionsTable.id, transactionId));

    return entryId;
  }

  async getAccountBalance(accountId: number, asOfDate?: string): Promise<number> {
    const [acct] = await db
      .select({ normalBalance: accountsTable.normalBalance })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .limit(1);

    if (!acct) return 0;

    const conditions = [eq(journalLinesTable.accountId, accountId)];
    if (asOfDate) {
      conditions.push(lte(journalEntriesTable.date, asOfDate));
    }

    const result = await db
      .select({
        totalDebits: sql<number>`coalesce(sum(cast(${journalLinesTable.debitAmount} as numeric)), 0)`,
        totalCredits: sql<number>`coalesce(sum(cast(${journalLinesTable.creditAmount} as numeric)), 0)`,
      })
      .from(journalLinesTable)
      .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
      .where(and(...conditions));

    const debits = Number(result[0]?.totalDebits ?? 0);
    const credits = Number(result[0]?.totalCredits ?? 0);

    if (acct.normalBalance === "debit") {
      return debits - credits;
    } else {
      return credits - debits;
    }
  }
}

export const accountingEngine = new AccountingEngine();
