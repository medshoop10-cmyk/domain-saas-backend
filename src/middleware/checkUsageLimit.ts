import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { getPlan, PLANS } from "../config/plans";
import { getUsage, incrementUsage, type UsageField } from "../services/usage";

interface LimitConfig {
  field: UsageField;
  limit: number;
}

const LIMITS: Record<string, (plan: (typeof PLANS)[keyof typeof PLANS]) => LimitConfig> = {
  search: (plan) => ({ field: "searchesCount", limit: plan.searchesPerDay }),
  alert: (plan) => ({ field: "alertsCount", limit: plan.maxAlerts }),
  favorite: (plan) => ({ field: "favoritesCount", limit: -1 }),
};

export function checkUsageLimit(action: "search" | "alert" | "favorite") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const planName = req.userPlan || "FREE";
    const plan = getPlan(planName);
    const { field, limit } = LIMITS[action](plan);

    if (limit === -1) return next();

    try {
      const usage = await getUsage(req.userId);
      const current = usage[field];

      if (current >= limit) {
        return res.status(429).json({
          error: `Daily ${action} limit reached (${limit}/${limit}). Upgrade your plan for more.`,
          limit,
          current,
          used: current,
          remaining: 0,
          plan: planName,
          action,
        });
      }

      const result = await incrementUsage(req.userId, field);
      const after = result.usage[field];

      if (after > limit) {
        return res.status(429).json({
          error: `Daily ${action} limit reached (${limit}/${limit}). Upgrade your plan for more.`,
          limit,
          current: after - 1,
          used: after - 1,
          remaining: 0,
          plan: planName,
          action,
        });
      }

      (req as any).usage = result.usage;

      next();
    } catch (err) {
      console.error(`[UsageMiddleware] Error for user ${req.userId}:`, err);
      next();
    }
  };
}
