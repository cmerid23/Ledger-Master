import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import businessesRouter from "./businesses";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import journalEntriesRouter from "./journalEntries";
import reconciliationsRouter from "./reconciliations";
import reportsRouter from "./reports";
import dashboardRouter from "./dashboard";
import uploadRouter from "./upload";
import adminRouter from "./admin";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(demoRouter);
router.use(businessesRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(journalEntriesRouter);
router.use(reconciliationsRouter);
router.use(reportsRouter);
router.use(dashboardRouter);
router.use(uploadRouter);

export default router;
