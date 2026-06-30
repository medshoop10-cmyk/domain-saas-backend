import { Router, Response } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { checkUsageLimit } from "../middleware/checkUsageLimit";
import { AppError } from "../middleware/errorHandler";
import { recordSave } from "../services/trending";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const [favorites, total] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId: req.userId },
      include: {
        domain: {
          select: {
            id: true,
            name: true,
            tld: true,
            score: true,
            length: true,
            isBrandable: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.favorite.count({ where: { userId: req.userId } }),
  ]);

  res.json({
    favorites: favorites.map((f) => ({
      id: f.id,
      domainId: f.domainId,
      domain: f.domain.name + f.domain.tld,
      name: f.domain.name,
      tld: f.domain.tld,
      score: f.domain.score,
      length: f.domain.length,
      isBrandable: f.domain.isBrandable,
      savedAt: f.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/", checkUsageLimit("favorite"), async (req: AuthRequest, res: Response) => {
  const { domainId } = req.body;
  if (!domainId) {
    return res.status(400).json({ error: "domainId is required" });
  }

  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) {
    return res.status(404).json({ error: "Domain not found" });
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_domainId: { userId: req.userId!, domainId } },
  });

  if (existing) {
    return res.status(409).json({ error: "Domain already in favorites" });
  }

  const favorite = await prisma.favorite.create({
    data: { userId: req.userId!, domainId },
  });

  await recordSave(domainId);

  res.status(201).json(favorite);
});

router.delete("/:domainId", async (req: AuthRequest, res: Response) => {
  const domainId = req.params.domainId as string;

  try {
    await prisma.favorite.delete({
      where: { userId_domainId: { userId: req.userId!, domainId } },
    });
    res.json({ success: true });
  } catch {
    throw new AppError(404, "Favorite not found");
  }
});

router.get("/check/:domainId", async (req: AuthRequest, res: Response) => {
  const domainId = req.params.domainId as string;
  const favorite = await prisma.favorite.findUnique({
    where: { userId_domainId: { userId: req.userId!, domainId } },
  });

  res.json({ isFavorited: !!favorite });
});

export default router;
