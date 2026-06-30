import { Router, Response } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/stats", requireAuth, async (req: AuthRequest, res: Response) => {
  const [favoritesCount, alertsCount, searchCount] = await Promise.all([
    prisma.favorite.count({ where: { userId: req.userId } }),
    prisma.alert.count({ where: { userId: req.userId } }),
    prisma.searchHistory.count({ where: { userId: req.userId } }),
  ]);

  res.json({
    favoritesCount,
    alertsCount,
    searchCount,
  });
});

router.get("/recent-searches", requireAuth, async (req: AuthRequest, res: Response) => {
  const searches = await prisma.searchHistory.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      query: true,
      filters: true,
      results: true,
      createdAt: true,
    },
  });

  res.json({ searches });
});

export default router;
