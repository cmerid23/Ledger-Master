import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "clearledger-dev-secret-change-in-production";

export interface AuthRequest extends Request {
  userId?: number;
  isAdmin?: boolean;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; isAdmin?: boolean };
    req.userId = payload.userId;
    req.isAdmin = payload.isAdmin ?? false;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  authMiddleware(req, res, () => {
    if (!req.isAdmin) {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }
    next();
  });
}

export function generateToken(userId: number, isAdmin = false): string {
  return jwt.sign({ userId, isAdmin }, JWT_SECRET, { expiresIn: "30d" });
}

export function generateAdminToken(userId: number): string {
  return generateToken(userId, true);
}
