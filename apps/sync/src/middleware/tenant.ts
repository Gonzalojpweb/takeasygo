import type { Request, Response, NextFunction } from "express"

export function tenantMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const auth = req.auth
  if (auth) {
    req.query.tenantId = auth.tenantId
  }
  next()
}
