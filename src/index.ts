import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import domainRoutes from "./routes/domains";
import favoriteRoutes from "./routes/favorites";
import alertRoutes from "./routes/alerts";
import trendingRoutes from "./routes/trending";
import availabilityRoutes from "./routes/availability";
import billingRoutes from "./routes/billing";
import userRoutes from "./routes/users";
import usageRoutes from "./routes/usage";
import searchRoutes from "./routes/searches";
import { scoreUnscoredDomains } from "./jobs/domainScorer";
import { calculateTrending } from "./jobs/trendingCalculator";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

const defaultOrigins = [
  "http://localhost:3000",
  "https://frontend-mu-seven-96.vercel.app",
  "https://frontend-abmgsd5p6-medshoop10-cmyks-projects.vercel.app",
  "https://frontend-f4b34pi1s-medshoop10-cmyks-projects.vercel.app",
];
const CORS_ORIGIN = process.env.CORS_ORIGIN || defaultOrigins.join(",");
const allowedOrigins = CORS_ORIGIN.split(",").map(s => s.trim());
const FRONTEND_URL = allowedOrigins[0];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Stripe webhook MUST receive raw body for signature verification
// Register BEFORE express.json() so raw body parser runs first
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

// All other routes use JSON body parser
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/domains", domainRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/trending", trendingRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/searches", searchRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    stripe: process.env.STRIPE_SECRET_KEY ? "connected" : "not configured",
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Cron jobs
cron.schedule("0 */6 * * *", () => {
  console.log("[Cron] Running domain scorer...");
  scoreUnscoredDomains().catch(console.error);
});

cron.schedule("*/15 * * * *", () => {
  console.log("[Cron] Running trending calculator...");
  calculateTrending().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[Server] Stripe: ${process.env.STRIPE_SECRET_KEY ? "configured" : "NOT configured"}`);
});

export default app;
