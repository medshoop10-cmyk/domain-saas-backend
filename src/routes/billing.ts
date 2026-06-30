import { Router, Response } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  createCheckoutSession,
  handleSubscriptionWebhook,
  getSubscriptionPortal,
  syncAllSubscriptions,
  verifyCheckoutSession,
} from "../services/billing";
import { AppError } from "../middleware/errorHandler";
import { stripe } from "../config/stripe";

const router = Router();

const createSessionSchema = z.object({
  plan: z.enum(["pro", "elite"]),
});

router.post("/create-checkout-session", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { plan } = createSessionSchema.parse(req.body);
    const result = await createCheckoutSession(req.userId!, plan);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid plan. Use 'pro' or 'elite'." });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

router.get("/verify-session", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      return res.status(400).json({ error: "session_id is required" });
    }
    const result = await verifyCheckoutSession(req.userId!, sessionId);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

router.post("/create-portal-session", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getSubscriptionPortal(req.userId!);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

// Raw body is provided by app-level middleware (express.raw)
router.post("/webhook", async (req, res: Response) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    await handleSubscriptionWebhook(event);
    res.json({ received: true, type: event.type });
  } catch (err) {
    console.error("[Stripe Webhook] Verification failed:", err);
    res.status(400).json({ error: "Webhook signature verification failed" });
  }
});

// Admin endpoint to sync all subscriptions
router.post("/sync", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await syncAllSubscriptions();
    res.json({ success: true });
  } catch (error) {
    console.error("[Stripe Sync] Error:", error);
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
