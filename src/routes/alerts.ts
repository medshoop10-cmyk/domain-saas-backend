import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { checkUsageLimit } from "../middleware/checkUsageLimit";
import { AppError } from "../middleware/errorHandler";

const router = Router();

router.use(requireAuth);

const createAlertSchema = z.object({
  domainId: z.string().uuid(),
  type: z.enum(["price_drop", "availability", "score_change"]).optional().default("price_drop"),
});

router.get("/", async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where: { userId: req.userId },
      include: {
        domain: {
          select: {
            id: true,
            name: true,
            tld: true,
            score: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.alert.count({ where: { userId: req.userId } }),
  ]);

  res.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      domainId: a.domainId,
      domain: a.domain.name + a.domain.tld,
      name: a.domain.name,
      tld: a.domain.tld,
      score: a.domain.score,
      type: a.type,
      isActive: a.isActive,
      createdAt: a.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/", checkUsageLimit("alert"), async (req: AuthRequest, res: Response) => {
  try {
    const { domainId, type } = createAlertSchema.parse(req.body);

    const domain = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const existing = await prisma.alert.findFirst({
      where: { userId: req.userId!, domainId, type },
    });

    if (existing) {
      return res.status(409).json({ error: "Alert already exists for this domain and type" });
    }

    const alert = await prisma.alert.create({
      data: { userId: req.userId!, domainId, type },
    });

    res.status(201).json(alert);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid alert data" });
    }
    throw error;
  }
});

router.patch("/:id/toggle", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const alert = await prisma.alert.findFirst({
    where: { id, userId: req.userId! },
  });

  if (!alert) {
    throw new AppError(404, "Alert not found");
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { isActive: !alert.isActive },
  });

  res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  try {
    await prisma.alert.delete({
      where: { id, userId: req.userId! },
    });
    res.json({ success: true });
  } catch {
    throw new AppError(404, "Alert not found");
  }
});

export default router;
