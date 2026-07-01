import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { optionalAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const PAYOUT_RATES: Record<string, number> = {
  GoDaddy: 0.8,
  Dynadot: 0.5,
  Spaceship: 0.2,
  Porkbun: 0.4,
};

const clickSchema = z.object({
  domain: z.string().min(1),
  registrar: z.string().min(1),
  position: z.enum(["top_card", "list_card"]).optional(),
});

router.post("/click", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { domain, registrar, position } = clickSchema.parse(req.body);

    const dotIndex = domain.indexOf(".");
    if (dotIndex === -1) {
      return res.status(400).json({ error: "Invalid domain format" });
    }
    const domainName = domain.substring(0, dotIndex);
    const domainTld = domain.substring(dotIndex);

    const domainRecord = await prisma.domain.findFirst({
      where: { name: domainName, tld: domainTld },
      select: { id: true },
    });

    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found" });
    }

    await prisma.click.create({
      data: {
        domainId: domainRecord.id,
        registrar,
        position: position ?? null,
        userId: req.userId ?? null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request" });
    }
    throw error;
  }
});

router.get("/registrars/stats", async (_req, res: Response) => {
  let stats;
  try {
    stats = await prisma.click.groupBy({
      by: ["registrar"],
      _count: { registrar: true },
      orderBy: { _count: { registrar: "desc" } },
    });
  } catch {
    return res.json({});
  }

  const result: Record<string, { clicks: number; value: number }> = {};
  if (stats) {
    for (const s of stats) {
      const clicks = s._count.registrar;
      const payout = PAYOUT_RATES[s.registrar] ?? 0;
      result[s.registrar] = { clicks, value: Math.round(clicks * payout * 100) / 100 };
    }
  }

  res.json(result);
});

export default router;
