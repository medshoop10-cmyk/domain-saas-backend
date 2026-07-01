import prisma from "../config/database";
import { stripe, STRIPE_PRICES } from "../config/stripe";
import { AppError } from "../middleware/errorHandler";

export async function createCheckoutSession(userId: string, plan: "pro" | "elite") {
  if (!stripe) {
    throw new AppError(503, "Stripe is not configured");
  }

  const priceId = plan === "pro" ? STRIPE_PRICES.pro : STRIPE_PRICES.elite;
  if (!priceId) {
    throw new AppError(400, `Price ID for ${plan} plan not configured. Run \`npm run stripe:setup\` first.`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User not found");

  let stripeCustomerId = user.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${(process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0].trim()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${(process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0].trim()}/pricing`,
    metadata: { userId, plan },
  });

  return { url: session.url, sessionId: session.id };
}

export async function verifyCheckoutSession(userId: string, sessionId: string) {
  if (!stripe) throw new AppError(503, "Stripe is not configured");

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!session) throw new AppError(404, "Session not found");

  if (session.metadata?.userId !== userId) {
    throw new AppError(403, "Session does not belong to this user");
  }

  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    throw new AppError(400, "Payment not completed");
  }

  const plan = session.metadata?.plan?.toUpperCase() as "PRO" | "ELITE" | undefined;
  if (!plan || !["PRO", "ELITE"].includes(plan)) {
    throw new AppError(400, "Invalid plan in session");
  }

  const subscriptionId = session.subscription;
  let sub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null;
  if (subscriptionId) {
    sub = await stripe.subscriptions.retrieve(subscriptionId as string);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        plan,
        stripeCustomerId: session.customer as string,
      },
    });

    if (subscriptionId) {
      await tx.subscription.upsert({
        where: { stripeSubscriptionId: subscriptionId as string },
        update: {
          status: (sub?.status as any) || "active",
          plan,
          currentPeriodStart: sub?.current_period_start ? new Date(sub.current_period_start * 1000) : undefined,
          currentPeriodEnd: sub?.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
        },
        create: {
          userId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscriptionId as string,
          plan,
          status: (sub?.status as any) || "active",
          currentPeriodStart: sub?.current_period_start ? new Date(sub.current_period_start * 1000) : undefined,
          currentPeriodEnd: sub?.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
        },
      });
    }
  });

  return { plan: plan.toLowerCase(), status: "active" };
}

async function upsertSubscription(
  subscriptionId: string,
  userId: string,
  customerId: string,
  planName: string,
  status: string,
  periodStart: Date,
  periodEnd: Date,
  cancelAtPeriodEnd: boolean,
) {
  const plan = planName.toUpperCase() as "PRO" | "ELITE";

  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { stripeSubscriptionId: subscriptionId },
      update: {
        status: status as any,
        plan,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        plan,
        status: status as any,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        plan,
        stripeCustomerId: customerId,
      },
    });
  });
}

export async function handleSubscriptionWebhook(event: any) {
  if (!stripe) return;
  const object = event.data.object;
  console.log(`[Stripe Webhook] ${event.type}`);

  const handleDeleted = async (subId: string) => {
    const sub = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subId },
    });
    if (!sub) return;

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { stripeSubscriptionId: subId },
        data: { status: "canceled", cancelAtPeriodEnd: false },
      });
      await tx.user.update({
        where: { id: sub.userId },
        data: { plan: "FREE" },
      });
    });
    console.log(`[Stripe] Downgraded user ${sub.userId} to FREE`);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = object.metadata?.userId;
      const plan = object.metadata?.plan?.toUpperCase() as "PRO" | "ELITE" | undefined;
      const subscriptionId = object.subscription;

      if (userId && plan && subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(
            subscriptionId,
            userId,
            object.customer,
            plan,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.cancel_at_period_end,
          );
          console.log(`[Stripe] Checkout completed: user=${userId}, plan=${plan}`);
        } catch (err) {
          console.error(`[Stripe] Failed to process checkout:`, err);
        }
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subId = object.id as string;
      const customerId = object.customer as string;
      const status = object.status as string;

      const items = object.items?.data || [];
      const priceId = items[0]?.price?.id;

      let planName = "FREE";
      if (status === "active" || status === "trialing") {
        if (priceId === STRIPE_PRICES.pro) planName = "PRO";
        else if (priceId === STRIPE_PRICES.elite) planName = "ELITE";
      }

      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        await upsertSubscription(
          subId,
          user.id,
          customerId,
          planName,
          status,
          new Date(object.current_period_start * 1000),
          new Date(object.current_period_end * 1000),
          object.cancel_at_period_end || false,
        );
        console.log(`[Stripe] Subscription ${event.type}: user=${user.id}, plan=${planName}, status=${status}`);
      }
      break;
    }

    case "customer.subscription.deleted": {
      await handleDeleted(object.id);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoiceSubId = object.subscription;
      if (invoiceSubId) {
        try {
          const sub = await stripe.subscriptions.retrieve(invoiceSubId);
          const existing = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: invoiceSubId },
          });
          if (existing) {
            await prisma.subscription.update({
              where: { stripeSubscriptionId: invoiceSubId },
              data: {
                status: sub.status as any,
                currentPeriodStart: new Date(sub.current_period_start * 1000),
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
              },
            });
          }
        } catch (err) {
          console.error("[Stripe] Failed to process invoice payment:", err);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const failedSubId = object.subscription;
      if (failedSubId) {
        const existing = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: failedSubId },
        });
        if (existing) {
          await prisma.subscription.update({
            where: { stripeSubscriptionId: failedSubId },
            data: { status: "past_due" },
          });
        }
      }
      break;
    }
  }
}

export async function getSubscriptionPortal(userId: string) {
  if (!stripe) throw new AppError(503, "Stripe is not configured");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripeCustomerId) {
    throw new AppError(400, "No active subscription");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${(process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0].trim()}/dashboard/billing`,
  });

  return { url: session.url };
}

export async function syncAllSubscriptions() {
  if (!stripe) {
    console.log("[Stripe Sync] Stripe not configured. Skipping.");
    return;
  }

  console.log("[Stripe Sync] Starting subscription sync...");
  const users = await prisma.user.findMany({
    where: { stripeCustomerId: { not: null } },
  });

  let synced = 0;
  for (const user of users) {
    if (!user.stripeCustomerId) continue;
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 1,
        status: "all",
      });

      const sub = subscriptions.data[0];
      if (sub && (sub.status === "active" || sub.status === "trialing")) {
        const items = sub.items?.data || [];
        const priceId = items[0]?.price?.id;
        let planName = "FREE";
        if (priceId === STRIPE_PRICES.pro) planName = "PRO";
        else if (priceId === STRIPE_PRICES.elite) planName = "ELITE";

        await upsertSubscription(
          sub.id,
          user.id,
          user.stripeCustomerId,
          planName,
          sub.status,
          new Date(sub.current_period_start * 1000),
          new Date(sub.current_period_end * 1000),
          sub.cancel_at_period_end,
        );
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: "FREE" },
        });
      }
      synced++;
    } catch (err) {
      console.error(`[Stripe Sync] Failed for user ${user.email}:`, err);
    }
  }
  console.log(`[Stripe Sync] Complete. Synced ${synced} users.`);
}

export async function getUserSubscription(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] } },
    orderBy: { createdAt: "desc" },
  });
  return sub;
}
