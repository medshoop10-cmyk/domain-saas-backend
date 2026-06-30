import { Router, Response } from "express";
import { getTrendingDomains } from "../services/trending";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";

const router = Router();

router.get("/", requireAuth, requireFeature("trendingAccess"), async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const result = await getTrendingDomains(page, limit);
    res.json(result);
  } catch (error) {
    console.error("Error fetching trending domains:", error);
    res.status(500).json({ error: "Failed to fetch trending domains" });
  }
});

export default router;
