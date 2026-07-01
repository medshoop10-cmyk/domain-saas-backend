import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

const recordSchema = z.object({
  query: z.string().min(1).max(200),
  results: z.number().int().min(0).optional().default(0),
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { query, results } = recordSchema.parse(req.body);

  await prisma.searchHistory.create({
    data: {
      userId: req.userId!,
      query,
      results,
    },
  });

  // Keep only last 50 searches per user (cleanup old ones)
  const count = await prisma.searchHistory.count({
    where: { userId: req.userId },
  });

  if (count > 50) {
    const oldest = await prisma.searchHistory.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "asc" },
      take: count - 50,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.searchHistory.deleteMany({
        where: { id: { in: oldest.map((o) => o.id) } },
      });
    }
  }

  res.status(201).json({ success: true });
});

router.get("/recent", async (req: AuthRequest, res: Response) => {
  const searches = await prisma.searchHistory.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      query: true,
      results: true,
      createdAt: true,
    },
  });

  res.json({ searches });
});

export default router;
