import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY not set. Stripe features disabled.");
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
  elite: process.env.STRIPE_ELITE_PRICE_ID || "",
};


