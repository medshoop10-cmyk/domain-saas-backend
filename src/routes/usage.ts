import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getUsage } from "../services/usage";
import { getPlan } from "../config/plans";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const usage = await getUsage(req.userId!);
  const plan = getPlan(req.userPlan || "FREE");

  const searchesRemaining = plan.searchesPerDay === -1 ? -1 : Math.max(0, plan.searchesPerDay - usage.searchesCount);
  const alertsRemaining = plan.maxAlerts === -1 ? -1 : Math.max(0, plan.maxAlerts - usage.alertsCount);

  res.json({
    usage,
    limits: {
      searchesPerDay: plan.searchesPerDay,
      maxAlerts: plan.maxAlerts,
    },
    remaining: {
      searches: searchesRemaining,
      alerts: alertsRemaining,
    },
    plan: req.userPlan,
  });
});

export default router;
