import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-domain-saas-2024";

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
}

export function generateToken(userId: string): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, plan: true, stripeCustomerId: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.userId = user.id;
    req.userPlan = user.plan;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, plan: true },
    });
    if (user) {
      req.userId = user.id;
      req.userPlan = user.plan;
    }
  } catch {
    // Silently continue without auth
  }
  next();
}
