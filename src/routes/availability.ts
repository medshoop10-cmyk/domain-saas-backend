import { Router, Response } from "express";
import { z } from "zod";
import { checkAvailability } from "../services/availability";
import redis from "../config/redis";

const router = Router();

const checkSchema = z.object({
  domain: z.string().min(1).max(253).regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Invalid domain format"),
});

router.get("/check", async (req, res: Response) => {
  try {
    const { domain } = checkSchema.parse(req.query);

    const cacheKey = `availability:${domain.toLowerCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }

    const result = await checkAvailability(domain);
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    res.json({ ...result, cached: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid domain format. Use format: example.com" });
    }
    throw error;
  }
});

export default router;
