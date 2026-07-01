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

async function computeStats(userId?: string): Promise<Record<string, { clicks: number; value: number }>> {
  const where = userId ? { userId } : undefined;
  let stats;
  try {
    stats = await prisma.click.groupBy({
      by: ["registrar"],
      _count: { registrar: true },
      where,
      orderBy: { _count: { registrar: "desc" } },
    });
  } catch {
    return {};
  }

  const result: Record<string, { clicks: number; value: number }> = {};
  if (stats) {
    for (const s of stats) {
      const clicks = s._count.registrar;
      const payout = PAYOUT_RATES[s.registrar] ?? 0;
      result[s.registrar] = { clicks, value: Math.round(clicks * payout * 100) / 100 };
    }
  }
  return result;
}

const clickSchema = z.object({
  domain: z.string().min(1),
  registrar: z.string().min(1),
  position: z.enum(["top_card", "list_card"]).optional(),
  variant: z.enum(["A", "B"]).optional(),
});

router.post("/click", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { domain, registrar, position, variant } = clickSchema.parse(req.body);

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
        variant: variant ?? null,
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
  const result = await computeStats();
  res.json(result);
});

router.get("/registrars/variants", async (_req, res: Response) => {
  let clicks;
  try {
    clicks = await prisma.click.findMany({
      where: { variant: { not: null } },
      select: { registrar: true, variant: true },
    });
  } catch {
    return res.json({});
  }

  const agg: Record<string, { A: number; B: number }> = {};
  for (const c of clicks) {
    if (!agg[c.registrar]) agg[c.registrar] = { A: 0, B: 0 };
    agg[c.registrar][c.variant as "A" | "B"]++;
  }

  const result: Record<string, { A: { clicks: number; value: number }; B: { clicks: number; value: number } }> = {};
  for (const [registrar, counts] of Object.entries(agg)) {
    const payout = PAYOUT_RATES[registrar] ?? 0;
    result[registrar] = {
      A: { clicks: counts.A, value: Math.round(counts.A * payout * 100) / 100 },
      B: { clicks: counts.B, value: Math.round(counts.B * payout * 100) / 100 },
    };
  }

  // Totals
  let totalA = 0, totalB = 0, valueA = 0, valueB = 0;
  for (const v of Object.values(result)) {
    totalA += v.A.clicks; valueA += v.A.value;
    totalB += v.B.clicks; valueB += v.B.value;
  }
  result._totals = { A: { clicks: totalA, value: Math.round(valueA * 100) / 100 }, B: { clicks: totalB, value: Math.round(valueB * 100) / 100 } };

  res.json(result);
});

router.get("/experiments/winner", async (_req, res: Response) => {
  let rows;
  try {
    rows = await prisma.click.findMany({
      where: { variant: { not: null } },
      select: { registrar: true, variant: true },
    });
  } catch {
    return res.json({ winner: null, confidence: 0, totalClicks: 0, locked: false });
  }

  if (rows.length === 0) {
    return res.json({ winner: null, confidence: 0, totalClicks: 0, locked: false });
  }

  let valueA = 0, valueB = 0;
  for (const r of rows) {
    const payout = PAYOUT_RATES[r.registrar] ?? 0;
    if (r.variant === "A") valueA += payout;
    else if (r.variant === "B") valueB += payout;
  }

  valueA = Math.round(valueA * 100) / 100;
  valueB = Math.round(valueB * 100) / 100;

  const totalValue = valueA + valueB;
  const confidence = totalValue > 0
    ? Math.round((Math.abs(valueA - valueB) / totalValue) * 100) / 100
    : 0;

  const winner = valueA > valueB ? "A" : valueB > valueA ? "B" : null;
  const locked = rows.length >= 10 && confidence > 0.25;

  res.json({ winner, confidence, totalClicks: rows.length, locked, variantA: { value: valueA }, variantB: { value: valueB } });
});

const voteSchema = z.object({
  registrar: z.string().min(1),
  score: z.union([z.literal(1), z.literal(-1)]),
});

router.post("/registrars/vote", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { registrar, score } = voteSchema.parse(req.body);

    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const existing = await prisma.registrarVote.findUnique({
      where: { userId_registrar: { userId: req.userId, registrar } },
    });

    if (existing) {
      if (existing.score === score) {
        await prisma.registrarVote.delete({ where: { id: existing.id } });
        return res.json({ vote: null });
      }
      const updated = await prisma.registrarVote.update({
        where: { id: existing.id },
        data: { score },
      });
      return res.json({ vote: { id: updated.id, score: updated.score } });
    }

    const vote = await prisma.registrarVote.create({
      data: { userId: req.userId, registrar, score },
    });

    res.json({ vote: { id: vote.id, score: vote.score } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request" });
    }
    throw error;
  }
});

router.get("/registrars/votes", async (_req, res: Response) => {
  try {
    const votes = await prisma.registrarVote.findMany({
      select: { registrar: true, score: true },
    });

    const agg: Record<string, { upvotes: number; downvotes: number; ratio: number }> = {};
    for (const v of votes) {
      if (!agg[v.registrar]) agg[v.registrar] = { upvotes: 0, downvotes: 0, ratio: 0 };
      if (v.score === 1) agg[v.registrar].upvotes++;
      else agg[v.registrar].downvotes++;
    }

    for (const r of Object.keys(agg)) {
      const total = agg[r].upvotes + agg[r].downvotes;
      agg[r].ratio = total > 0 ? Math.round((agg[r].upvotes / total) * 100) : 0;
    }

    res.json(agg);
  } catch {
    res.json({});
  }
});

router.get("/registrars/personalized", optionalAuth, async (req: AuthRequest, res: Response) => {
  const globalStats = await computeStats();
  let personalStats: Record<string, { clicks: number; value: number }> = {};
  let personalBest: string | null = null;

  if (req.userId) {
    personalStats = await computeStats(req.userId);
    const sorted = Object.entries(personalStats).sort((a, b) => b[1].clicks - a[1].clicks);
    if (sorted.length > 0) personalBest = sorted[0][0];
  }

  // Community votes per registrar
  let voteRows: { registrar: string; score: number }[] = [];
  try {
    voteRows = await prisma.registrarVote.findMany({ select: { registrar: true, score: true } });
  } catch { /* no votes */ }

  const communityVotes: Record<string, { upvotes: number; downvotes: number }> = {};
  for (const v of voteRows) {
    if (!communityVotes[v.registrar]) communityVotes[v.registrar] = { upvotes: 0, downvotes: 0 };
    if (v.score === 1) communityVotes[v.registrar].upvotes++;
    else communityVotes[v.registrar].downvotes++;
  }

  res.json({ global: globalStats, personal: personalStats, personalBest, communityVotes });
});

export default router;
