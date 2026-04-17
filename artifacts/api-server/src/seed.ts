import {
  db,
  usersTable,
  businessesTable,
  accountsTable,
  customersTable,
  vendorsTable,
  jobsTable,
  invoicesTable,
  invoiceLineItemsTable,
  billsTable,
  billLineItemsTable,
  vehiclesTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database…");

  // ── Users ────────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("admin123", 10);
  const demoHash = await bcrypt.hash("demo123", 10);

  const [admin] = await db
    .insert(usersTable)
    .values({ email: "admin@clearledger.com", passwordHash: adminHash, name: "Admin User", role: "admin" })
    .onConflictDoNothing({ target: usersTable.email })
    .returning();

  const [demo] = await db
    .insert(usersTable)
    .values({ email: "demo@clearledger.com", passwordHash: demoHash, name: "Demo User", role: "user" })
    .onConflictDoNothing({ target: usersTable.email })
    .returning();

  // Fetch if already existed
  const adminUser = admin ?? (await db.query.usersTable.findFirst({ where: eq(usersTable.email, "admin@clearledger.com") }))!;
  const demoUser = demo ?? (await db.query.usersTable.findFirst({ where: eq(usersTable.email, "demo@clearledger.com") }))!;

  console.log(`  ✓ Users: admin(${adminUser.id}), demo(${demoUser.id})`);

  // ── Businesses ───────────────────────────────────────────────────────────────
  const existingBiz = await db.query.businessesTable.findFirst({
    where: eq(businessesTable.userId, demoUser.id),
  });

  if (existingBiz) {
    console.log(`  ✓ Business already exists (id=${existingBiz.id}), skipping seed data`);
    console.log("✅ Seed complete (existing data kept)");
    process.exit(0);
  }

  const [adminBiz] = await db
    .insert(businessesTable)
    .values({ userId: adminUser.id, name: "ClearLedger HQ", currency: "USD", fiscalYearStart: 1 })
    .returning();

  const [demoBiz] = await db
    .insert(businessesTable)
    .values({ userId: demoUser.id, name: "Apex Freight LLC", currency: "USD", fiscalYearStart: 1 })
    .returning();

  console.log(`  ✓ Businesses: HQ(${adminBiz.id}), Apex Freight(${demoBiz.id})`);

  // ── Chart of Accounts ────────────────────────────────────────────────────────
  // Seed for both businesses
  for (const bizId of [adminBiz.id, demoBiz.id]) {
    await db.insert(accountsTable).values([
      // ASSETS
      { businessId: bizId, code: "1000", name: "Cash & Cash Equivalents",   type: "asset" },
      { businessId: bizId, code: "1010", name: "Checking Account",           type: "asset" },
      { businessId: bizId, code: "1020", name: "Savings Account",            type: "asset" },
      { businessId: bizId, code: "1100", name: "Accounts Receivable",        type: "asset" },
      { businessId: bizId, code: "1200", name: "Fuel Inventory",             type: "asset" },
      { businessId: bizId, code: "1300", name: "Prepaid Expenses",           type: "asset" },
      { businessId: bizId, code: "1500", name: "Fleet & Equipment",          type: "asset" },
      { businessId: bizId, code: "1510", name: "Vehicles",                   type: "asset" },
      { businessId: bizId, code: "1520", name: "Accumulated Depreciation",   type: "asset" },
      // LIABILITIES
      { businessId: bizId, code: "2000", name: "Accounts Payable",           type: "liability" },
      { businessId: bizId, code: "2100", name: "Accrued Liabilities",        type: "liability" },
      { businessId: bizId, code: "2200", name: "Sales Tax Payable",          type: "liability" },
      { businessId: bizId, code: "2300", name: "Payroll Liabilities",        type: "liability" },
      { businessId: bizId, code: "2500", name: "Notes Payable - Equipment",  type: "liability" },
      { businessId: bizId, code: "2600", name: "Long-Term Debt",             type: "liability" },
      // EQUITY
      { businessId: bizId, code: "3000", name: "Owner's Equity",             type: "equity" },
      { businessId: bizId, code: "3100", name: "Retained Earnings",          type: "equity" },
      { businessId: bizId, code: "3200", name: "Owner's Draws",              type: "equity" },
      // INCOME
      { businessId: bizId, code: "4000", name: "Revenue",                    type: "income" },
      { businessId: bizId, code: "4010", name: "Freight Revenue",            type: "income" },
      { businessId: bizId, code: "4020", name: "Fuel Surcharge Revenue",     type: "income" },
      { businessId: bizId, code: "4030", name: "Accessorial Charges",        type: "income" },
      { businessId: bizId, code: "4100", name: "Other Income",               type: "income" },
      // EXPENSES
      { businessId: bizId, code: "5000", name: "Cost of Revenue",            type: "expense" },
      { businessId: bizId, code: "5010", name: "Driver Pay",                 type: "expense" },
      { businessId: bizId, code: "5020", name: "Owner-Operator Settlements", type: "expense" },
      { businessId: bizId, code: "5100", name: "Fuel Expense",               type: "expense" },
      { businessId: bizId, code: "5110", name: "DEF Fluid",                  type: "expense" },
      { businessId: bizId, code: "5200", name: "Maintenance & Repairs",      type: "expense" },
      { businessId: bizId, code: "5210", name: "Tires",                      type: "expense" },
      { businessId: bizId, code: "5220", name: "Parts & Supplies",           type: "expense" },
      { businessId: bizId, code: "5300", name: "Tolls & Scales",             type: "expense" },
      { businessId: bizId, code: "5400", name: "Insurance",                  type: "expense" },
      { businessId: bizId, code: "5410", name: "Cargo Insurance",            type: "expense" },
      { businessId: bizId, code: "5500", name: "Permits & Licenses",         type: "expense" },
      { businessId: bizId, code: "5600", name: "Depreciation Expense",       type: "expense" },
      { businessId: bizId, code: "6000", name: "General & Administrative",   type: "expense" },
      { businessId: bizId, code: "6010", name: "Office Supplies",            type: "expense" },
      { businessId: bizId, code: "6020", name: "Professional Services",      type: "expense" },
      { businessId: bizId, code: "6030", name: "Software & Subscriptions",   type: "expense" },
      { businessId: bizId, code: "6040", name: "Bank & Processing Fees",     type: "expense" },
      { businessId: bizId, code: "6050", name: "Advertising & Marketing",    type: "expense" },
      { businessId: bizId, code: "6100", name: "Utilities",                  type: "expense" },
      { businessId: bizId, code: "6200", name: "Rent & Occupancy",           type: "expense" },
      { businessId: bizId, code: "6300", name: "Travel & Meals",             type: "expense" },
      { businessId: bizId, code: "6400", name: "Taxes & Licenses",           type: "expense" },
      { businessId: bizId, code: "6500", name: "Interest Expense",           type: "expense" },
      { businessId: bizId, code: "6900", name: "Miscellaneous Expense",      type: "expense" },
    ]);
  }
  console.log("  ✓ Chart of accounts seeded (46 accounts × 2 businesses)");

  // ── Demo Customers ───────────────────────────────────────────────────────────
  await db.insert(customersTable).values([
    { businessId: demoBiz.id, name: "Walmart Distribution Center", email: "billing@walmart-dc.com", phone: "555-100-1000", city: "Bentonville", state: "AR", paymentTerms: 30 },
    { businessId: demoBiz.id, name: "Amazon Fulfillment Network",  email: "ap@amazon-freight.com",  phone: "555-200-2000", city: "Seattle",     state: "WA", paymentTerms: 15 },
    { businessId: demoBiz.id, name: "Home Depot Supply Chain",     email: "freight@homedepot.com",  phone: "555-300-3000", city: "Atlanta",     state: "GA", paymentTerms: 30 },
    { businessId: demoBiz.id, name: "Target Logistics",            email: "loads@target.com",       phone: "555-400-4000", city: "Minneapolis", state: "MN", paymentTerms: 45 },
  ]);
  console.log("  ✓ Demo customers seeded");

  // ── Demo Vendors ─────────────────────────────────────────────────────────────
  await db.insert(vendorsTable).values([
    { businessId: demoBiz.id, name: "Flying J Travel Center",   phone: "800-555-0101", city: "Knoxville",    state: "TN", paymentTerms: 15 },
    { businessId: demoBiz.id, name: "Pilot Travel Centers",     phone: "800-555-0102", city: "Knoxville",    state: "TN", paymentTerms: 15 },
    { businessId: demoBiz.id, name: "TA Petro Stopping Centers",phone: "800-555-0103", city: "Westlake",     state: "OH", paymentTerms: 30 },
    { businessId: demoBiz.id, name: "Roadmaster Truck Repair",  phone: "555-500-5000", city: "Dallas",       state: "TX", paymentTerms: 30 },
    { businessId: demoBiz.id, name: "Great West Casualty Co.",  phone: "800-555-0150", city: "South Sioux City", state: "NE", paymentTerms: 30 },
    { businessId: demoBiz.id, name: "OOIDA",                    phone: "800-444-5791", city: "Grain Valley", state: "MO", paymentTerms: 30 },
  ]);
  console.log("  ✓ Demo vendors seeded");

  // ── Demo Vehicle ─────────────────────────────────────────────────────────────
  await db.insert(vehiclesTable).values([
    { businessId: demoBiz.id, name: "Unit 101 – Freightliner",  make: "Freightliner", model: "Cascadia", year: 2021, licensePlate: "TX-TRK101", vin: "1FUJGBDV0MLMK1001", odometerStart: "125000", fuelType: "diesel" },
    { businessId: demoBiz.id, name: "Unit 102 – Kenworth",      make: "Kenworth",     model: "T680",     year: 2022, licensePlate: "TX-TRK102", vin: "2XKJD49X4SM000102", odometerStart: "88000",  fuelType: "diesel" },
  ]);
  console.log("  ✓ Demo vehicles seeded");

  // ── Demo Jobs ────────────────────────────────────────────────────────────────
  await db.insert(jobsTable).values([
    { businessId: demoBiz.id, name: "Dallas → Atlanta Run",       jobNumber: "J-2025-001", status: "completed", jobType: "route", origin: "Dallas, TX", destination: "Atlanta, GA",      estimatedMiles: "780", flatRate: "2340.00",  estimatedRevenue: "2340.00", actualRevenue: "2340.00", startDate: "2025-01-06", endDate: "2025-01-08" },
    { businessId: demoBiz.id, name: "Chicago → Houston Haul",     jobNumber: "J-2025-002", status: "completed", jobType: "route", origin: "Chicago, IL", destination: "Houston, TX",     estimatedMiles: "1090", flatRate: "3270.00", estimatedRevenue: "3270.00", actualRevenue: "3270.00", startDate: "2025-01-13", endDate: "2025-01-15" },
    { businessId: demoBiz.id, name: "LA → Phoenix Express",       jobNumber: "J-2025-003", status: "active",    jobType: "load",  origin: "Los Angeles, CA", destination: "Phoenix, AZ", estimatedMiles: "370", flatRate: "1480.00",  estimatedRevenue: "1480.00", actualRevenue: "0.00",    startDate: "2025-02-03" },
  ]);
  console.log("  ✓ Demo jobs seeded");

  // ── Demo Invoices ────────────────────────────────────────────────────────────
  const customers = await db.query.customersTable.findMany({ where: eq(customersTable.businessId, demoBiz.id) });
  const walmart = customers.find(c => c.name.includes("Walmart"))!;
  const amazon  = customers.find(c => c.name.includes("Amazon"))!;

  const [inv1] = await db.insert(invoicesTable).values({
    businessId: demoBiz.id, customerId: walmart.id, invoiceNumber: "INV-2025-001",
    status: "paid", issueDate: "2025-01-08", dueDate: "2025-02-07",
    subtotal: "2340.00", taxRate: "0", taxAmount: "0", discountAmount: "0",
    total: "2340.00", amountPaid: "2340.00", balanceDue: "0.00", currency: "USD",
  }).returning();

  await db.insert(invoiceLineItemsTable).values({ invoiceId: inv1.id, description: "Freight – Dallas to Atlanta (780 mi)", quantity: "1", rate: "2340.00", amount: "2340.00", sortOrder: 0 });

  const [inv2] = await db.insert(invoicesTable).values({
    businessId: demoBiz.id, customerId: amazon.id, invoiceNumber: "INV-2025-002",
    status: "sent", issueDate: "2025-01-15", dueDate: "2025-01-30",
    subtotal: "3270.00", taxRate: "0", taxAmount: "0", discountAmount: "0",
    total: "3270.00", amountPaid: "0.00", balanceDue: "3270.00", currency: "USD",
  }).returning();

  await db.insert(invoiceLineItemsTable).values([
    { invoiceId: inv2.id, description: "Freight – Chicago to Houston (1,090 mi)", quantity: "1", rate: "3000.00", amount: "3000.00", sortOrder: 0 },
    { invoiceId: inv2.id, description: "Fuel Surcharge",                          quantity: "1", rate: "270.00",  amount: "270.00",  sortOrder: 1 },
  ]);
  console.log("  ✓ Demo invoices seeded");

  // ── Demo Bills ───────────────────────────────────────────────────────────────
  const vendors = await db.query.vendorsTable.findMany({ where: eq(vendorsTable.businessId, demoBiz.id) });
  const flyingJ = vendors.find(v => v.name.includes("Flying J"))!;
  const repair  = vendors.find(v => v.name.includes("Roadmaster"))!;

  const [bill1] = await db.insert(billsTable).values({
    businessId: demoBiz.id, vendorId: flyingJ.id, billNumber: "FJ-88201",
    status: "paid", billDate: "2025-01-07", dueDate: "2025-01-22",
    subtotal: "1240.00", taxRate: "0", taxAmount: "0", total: "1240.00", amountPaid: "1240.00", balanceDue: "0.00",
  }).returning();
  await db.insert(billLineItemsTable).values({ billId: bill1.id, description: "Diesel fuel – 310 gallons @ $4.00", quantity: "310", rate: "4.00", amount: "1240.00", sortOrder: 0 });

  const [bill2] = await db.insert(billsTable).values({
    businessId: demoBiz.id, vendorId: repair.id, billNumber: "RM-5503",
    status: "unpaid", billDate: "2025-01-20", dueDate: "2025-02-19",
    subtotal: "875.00", taxRate: "0", taxAmount: "0", total: "875.00", amountPaid: "0.00", balanceDue: "875.00",
  }).returning();
  await db.insert(billLineItemsTable).values([
    { billId: bill2.id, description: "Brake inspection & pad replacement – Unit 101", quantity: "1", rate: "450.00", amount: "450.00", sortOrder: 0 },
    { billId: bill2.id, description: "Oil change & filter – Unit 101",                quantity: "1", rate: "425.00", amount: "425.00", sortOrder: 1 },
  ]);
  console.log("  ✓ Demo bills seeded");

  console.log("✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
