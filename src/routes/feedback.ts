import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { optionalAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const feedbackSchema = z.object({
  domain: z.string().min(1),
  score: z.union([z.literal(1), z.literal(-1)]),
  query: z.string().optional(),
});

router.post("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { domain, score, query } = feedbackSchema.parse(req.body);

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

    // Upsert: update score if already exists, create if not
    const existing = req.userId ? await prisma.feedback.findUnique({
      where: { userId_domainId: { userId: req.userId, domainId: domainRecord.id } },
    }) : null;

    if (existing) {
      if (existing.score === score) {
        // Same vote — remove (toggle off)
        await prisma.feedback.delete({ where: { id: existing.id } });
        return res.json({ feedback: null });
      }
      // Different vote — update
      const updated = await prisma.feedback.update({
        where: { id: existing.id },
        data: { score, query: query ?? existing.query },
      });
      return res.json({ feedback: { id: updated.id, score: updated.score } });
    }

    const feedback = await prisma.feedback.create({
      data: {
        domainId: domainRecord.id,
        score,
        query: query ?? null,
        userId: req.userId ?? null,
      },
    });

    res.json({ feedback: { id: feedback.id, score: feedback.score } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request" });
    }
    throw error;
  }
});

router.get("/:domainId", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const domainId = req.params.domainId as string;

    if (!req.userId) {
      return res.json({ feedback: null });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { userId_domainId: { userId: req.userId, domainId } },
      select: { score: true, id: true },
    });

    res.json({ feedback });
  } catch {
    res.json({ feedback: null });
  }
});

export default router;
