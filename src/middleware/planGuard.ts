import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { getPlan } from "../config/plans";
import { AppError } from "./errorHandler";

type Feature = "alerts" | "csvExport" | "apiAccess" | "earlyAccess" | "trendingAccess" | "prioritySupport";

export function requireFeature(feature: Feature) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const plan = getPlan(req.userPlan || "FREE");

      if (!(plan as any)[feature]) {
        return res.status(403).json({
          error: `Your ${plan.name} plan does not include ${feature}. Upgrade to access this feature.`,
          feature,
          requiredPlan: feature === "apiAccess" || feature === "earlyAccess" ? "Elite" : "Pro",
          currentPlan: req.userPlan,
        });
      }

      next();
    } catch {
      next(new AppError(500, "Plan check failed"));
    }
  };
}
