import bcrypt from "bcryptjs";
import prisma from "../config/database";
import { generateToken } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getUsage } from "./usage";

export async function register(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });

  const token = generateToken(user.id);

  return {
    user: {
      ...user,
      searchCount: 0,
      alertCount: 0,
      stripeCustomerId: null,
      dailyUsage: { searchesCount: 0, alertsCount: 0, favoritesCount: 0 },
      subscription: null,
      _count: { favorites: 0, alerts: 0 },
    },
    token,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = generateToken(user.id);

  const [dailyUsage, subscription] = await Promise.all([
    getUsage(user.id),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ["active", "trialing"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const favoritesCount = await prisma.favorite.count({ where: { userId: user.id } });
  const alertsCount = await prisma.alert.count({ where: { userId: user.id } });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      searchCount: user.searchCount,
      alertCount: user.alertCount,
      createdAt: user.createdAt,
      stripeCustomerId: user.stripeCustomerId,
      dailyUsage,
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      _count: { favorites: favoritesCount, alerts: alertsCount },
    },
    token,
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      searchCount: true,
      alertCount: true,
      createdAt: true,
      stripeCustomerId: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  const [subscription, dailyUsage, favoritesCount, alertsCount] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: { in: ["active", "trialing"] } },
      orderBy: { createdAt: "desc" },
    }),
    getUsage(userId),
    prisma.favorite.count({ where: { userId } }),
    prisma.alert.count({ where: { userId } }),
  ]);

  return {
    ...user,
    dailyUsage,
    _count: { favorites: favoritesCount, alerts: alertsCount },
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  };
}
