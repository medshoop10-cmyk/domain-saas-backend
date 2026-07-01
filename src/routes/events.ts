import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { optionalAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const clickSchema = z.object({
  domain: z.string().min(1),
  registrar: z.string().min(1),
});

router.post("/click", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { domain, registrar } = clickSchema.parse(req.body);

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

export default router;
