import jwt from "jsonwebtoken";

/**
 * Name of the HTTPOnly cookie that carries the JWT (Challenge 1).
 */
export const AUTH_COOKIE = "studiospace_token";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

/** Issue the JWT as an HTTPOnly cookie (7 days, matching the token expiry). */
export function signAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // keep in sync with signToken's "7d"
  });
}

/** Remove the auth cookie, e.g. on logout. */
export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, baseCookieOptions);
}

/**
 * Accepts the JWT either from an `Authorization: Bearer <token>` header or
 * from the HTTPOnly auth cookie, and attaches the decoded payload to
 * `req.user`. Rejects with 401 otherwise.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
