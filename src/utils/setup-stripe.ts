import dotenv from "dotenv";
dotenv.config();

import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret || stripeSecret === "sk_test_placeholder") {
  console.error("❌ STRIPE_SECRET_KEY is not set or is still a placeholder.");
  console.error("   Get your key from https://dashboard.stripe.com/test/apikeys");
  console.error("   Add it to your .env file: STRIPE_SECRET_KEY=sk_test_...");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, { apiVersion: "2025-02-24.acacia" });

const PLANS = [
  {
    name: "Pro",
    description: "For serious domain investors and professionals.",
    price: 1900, // $19.00 in cents
    features: [
      "1,000 searches per month",
      "50 alerts",
      "Advanced AI scoring",
      "Priority support",
      "Trending feed access",
      "CSV export",
    ],
  },
  {
    name: "Elite",
    description: "Maximum power for domain portfolios at scale.",
    price: 4900, // $49.00 in cents
    features: [
      "10,000 searches per month",
      "200 alerts",
      "Everything in Pro",
      "Early access features",
      "API access",
      "Dedicated support",
      "Bulk domain checking",
    ],
  },
];

async function setupStripe() {
  console.log("\n🚀 Setting up Stripe products and prices...\n");

  for (const plan of PLANS) {
    // Check if product already exists
    const existing = await stripe.products.list({
      active: true,
      limit: 100,
    });

    const existingProduct = existing.data.find(
      (p) => p.name === plan.name && p.metadata?.source === "domainpulse"
    );

    let product: Stripe.Product;
    let price: Stripe.Price;

    if (existingProduct) {
      product = existingProduct;
      // Check for existing active price
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
        limit: 10,
      });

      const existingPrice = existingPrices.data.find(
        (p) => p.unit_amount === plan.price && p.recurring?.interval === "month"
      );

      if (existingPrice) {
        price = existingPrice;
        console.log(`✅ ${plan.name}: Product and price already exist`);
        console.log(`   Product ID: ${product.id}`);
        console.log(`   Price ID:   ${price.id}`);
        console.log(`   Price:      $${(plan.price / 100).toFixed(2)}/month\n`);
        continue;
      }

      // Create new price for existing product
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { source: "domainpulse", plan: plan.name.toLowerCase() },
      });
      console.log(`✅ ${plan.name}: New price created`);
    } else {
      // Create product and price
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { source: "domainpulse", plan: plan.name.toLowerCase() },
      });

      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { source: "domainpulse", plan: plan.name.toLowerCase() },
      });

      console.log(`✅ ${plan.name}: Product and price created`);
    }

    console.log(`   Product ID: ${product.id}`);
    console.log(`   Price ID:   ${price.id}`);
    console.log(`   Price:      $${(plan.price / 100).toFixed(2)}/month\n`);
  }

  // Output .env additions
  console.log("═══════════════════════════════════════════");
  console.log("  Add these to your .env file:");
  console.log("═══════════════════════════════════════════");

  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
  });

  for (const plan of PLANS) {
    const p = prices.data.find(
      (pr) =>
        pr.unit_amount === plan.price &&
        pr.recurring?.interval === "month" &&
        pr.metadata?.source === "domainpulse"
    );
    if (p) {
      const envVar = plan.name.toUpperCase();
      console.log(`  STRIPE_${envVar}_PRICE_ID="${p.id}"`);
    }
  }

  // Create a webhook endpoint suggestion
  console.log("\n📡 Webhook endpoint:");
  console.log(`   Add this endpoint in Stripe Dashboard > Webhooks:`);
  console.log(`   https://dashboard.stripe.com/webhooks`);
  console.log(`   Endpoint URL: https://your-api.com/api/billing/webhook`);
  console.log(`   Events: checkout.session.completed, customer.subscription.deleted`);
  console.log(`   Then set STRIPE_WEBHOOK_SECRET=whsec_... in your .env\n`);

  console.log("✨ Setup complete!\n");
}

setupStripe().catch((err) => {
  console.error("❌ Setup failed:", err.message);
  process.exit(1);
});
