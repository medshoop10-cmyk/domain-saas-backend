import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { getPlan } from "../config/plans";

type Feature = "alertsEnabled" | "csvExport" | "apiAccess" | "earlyAccess" | "trendingAccess" | "prioritySupport";

const FEATURE_LABELS: Record<Feature, string> = {
  alertsEnabled: "alerts",
  csvExport: "CSV export",
  apiAccess: "API access",
  earlyAccess: "early access",
  trendingAccess: "trending feed",
  prioritySupport: "priority support",
};

const MIN_PLANS: Record<Feature, string> = {
  alertsEnabled: "pro",
  csvExport: "pro",
  apiAccess: "elite",
  earlyAccess: "elite",
  trendingAccess: "pro",
  prioritySupport: "pro",
};

export function requireFeature(feature: Feature) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const plan = getPlan(req.userPlan || "FREE");

    if (!plan[feature]) {
      const label = FEATURE_LABELS[feature];
      const needed = MIN_PLANS[feature];
      return res.status(403).json({
        error: `Your ${plan.name} plan does not include ${label}. Upgrade to ${needed} to access this feature.`,
        feature: label,
        requiredPlan: needed,
        currentPlan: req.userPlan,
      });
    }

    next();
  };
}
