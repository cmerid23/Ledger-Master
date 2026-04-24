import { Router, type IRouter } from "express";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware as any);

// Keyword-based smart categorizer with optional AI enhancement
const KEYWORDS: Record<string, string[]> = {
  "Fuel & Gas": ["fuel", "gas", "diesel", "petrol", "shell", "chevron", "bp", "exxon", "mobil", "pilot", "love's", "ta truck"],
  "Meals & Entertainment": ["restaurant", "cafe", "coffee", "lunch", "dinner", "breakfast", "mcdonald", "subway", "chipotle", "starbucks", "doordash", "grubhub", "uber eats"],
  "Office Supplies": ["office depot", "staples", "amazon", "supplies", "paper", "ink", "printer", "toner"],
  "Software & Subscriptions": ["software", "subscription", "saas", "microsoft", "google", "adobe", "slack", "zoom", "quickbooks", "netflix", "spotify"],
  "Utilities": ["electric", "electricity", "water", "gas utility", "internet", "phone", "utility", "at&t", "verizon", "comcast"],
  "Insurance": ["insurance", "progressive", "geico", "allstate", "state farm", "travelers"],
  "Repairs & Maintenance": ["repair", "maintenance", "service", "mechanic", "oil change", "tire", "muffler"],
  "Payroll": ["payroll", "salary", "wages", "adp", "gusto", "direct deposit"],
  "Rent & Lease": ["rent", "lease", "landlord", "property", "office rent"],
  "Marketing & Advertising": ["marketing", "advertising", "facebook ads", "google ads", "social media", "mailchimp", "campaign"],
  "Travel": ["hotel", "motel", "airbnb", "flight", "airline", "uber", "lyft", "taxi", "toll", "parking"],
  "Professional Services": ["attorney", "lawyer", "accountant", "consultant", "cpa", "legal", "advising"],
  "Cost of Goods Sold": ["materials", "inventory", "supplies", "parts", "raw materials", "merchandise"],
};

async function aiCategorize(description: string, amount: number, businessId: number): Promise<{ category: string; confidence: number; accountId?: number }> {
  const descLower = description.toLowerCase();

  // First try keyword matching
  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    for (const kw of keywords) {
      if (descLower.includes(kw)) {
        // Try to find matching account
        const accounts = await db.select().from(accountsTable).where(eq(accountsTable.businessId, businessId));
        const match = accounts.find(a =>
          a.name.toLowerCase().includes(category.split(" ")[0].toLowerCase()) ||
          a.name.toLowerCase().includes(category.split(" & ")[0].toLowerCase())
        );
        return { category, confidence: 0.85, accountId: match?.id };
      }
    }
  }

  // Fallback: use amount to guess category
  if (amount < 0) {
    return { category: "Uncategorized Expense", confidence: 0.3 };
  }
  return { category: "Uncategorized Income", confidence: 0.3 };
}

router.post("/ai/categorize", async (req: AuthRequest, res) => {
  try {
    const { description, amount, businessId } = req.body;
    if (!description || !businessId) return res.status(400).json({ error: "description and businessId required" });
    const result = await aiCategorize(description, parseFloat(amount || "0"), Number(businessId));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Categorization failed" });
  }
});

// Batch categorize multiple transactions
router.post("/ai/categorize-batch", async (req: AuthRequest, res) => {
  try {
    const { transactions, businessId } = req.body;
    if (!Array.isArray(transactions) || !businessId) return res.status(400).json({ error: "transactions array and businessId required" });
    const results = await Promise.all(
      transactions.map((t: any) => aiCategorize(t.description, parseFloat(t.amount || "0"), Number(businessId)))
    );
    res.json(results);
  } catch {
    res.status(500).json({ error: "Batch categorization failed" });
  }
});

// Quick invoice parser — extract line items from a natural language description
router.post("/ai/quick-invoice", async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });

    const lineItems: any[] = [];
    const lines = text.split(/[\n,;]+/).map((l: string) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Try to extract quantity × item @ rate patterns
      const qtyItemRate = line.match(/^(\d+(?:\.\d+)?)\s*x?\s*(.+?)\s*@\s*\$?(\d+(?:\.\d+)?)$/i);
      if (qtyItemRate) {
        const qty = parseFloat(qtyItemRate[1]);
        const desc = qtyItemRate[2].trim();
        const rate = parseFloat(qtyItemRate[3]);
        lineItems.push({ description: desc, quantity: qty.toString(), rate: rate.toFixed(2), amount: (qty * rate).toFixed(2), unit: "" });
        continue;
      }

      // Try: item $amount
      const itemAmt = line.match(/^(.+?)\s+\$?(\d+(?:\.\d+)?)$/);
      if (itemAmt) {
        const desc = itemAmt[1].trim();
        const rate = parseFloat(itemAmt[2]);
        lineItems.push({ description: desc, quantity: "1", rate: rate.toFixed(2), amount: rate.toFixed(2), unit: "" });
        continue;
      }

      // Just use the whole line as a description with 0 rate
      if (line.length > 2) {
        lineItems.push({ description: line, quantity: "1", rate: "0", amount: "0", unit: "" });
      }
    }

    const subtotal = lineItems.reduce((s, li) => s + parseFloat(li.amount), 0);
    res.json({ lineItems, subtotal: subtotal.toFixed(2) });
  } catch {
    res.status(500).json({ error: "Failed to parse invoice" });
  }
});

export default router;
