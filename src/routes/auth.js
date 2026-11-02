import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getDb } from "../db.js";

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function collectErrors({ name, email, password }) {
  const errors = [];

  if (typeof name !== "string" || !name.trim()) {
    errors.push("Name is required");
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    errors.push("A valid email is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
    errors.push(
      "Password must contain at least one uppercase and one lowercase letter",
    );
  }

  return errors;
}

authRouter.post("/register", async (req, res) => {
  const { name, email, password } = req.body ?? {};

  const errors = collectErrors({ name, email, password });
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const users = getDb().collection("users");
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await users.findOne(
    { email: normalizedEmail },
    { projection: { _id: 1 } },
  );
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { insertedId } = await users.insertOne({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date(),
  });

  const user = {
    id: insertedId.toString(),
    name: name.trim(),
    email: normalizedEmail,
  };

  res.status(201).json({ token: signToken(user), user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || typeof password !== "string" || !password) {
    return res
      .status(400)
      .json({ error: "Email and password are required" });
  }

  const record = await getDb()
    .collection("users")
    .findOne({ email: normalizedEmail });

  const passwordMatches = record
    ? await bcrypt.compare(password, record.passwordHash)
    : false;

  if (!record || !passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user = {
    id: record._id.toString(),
    name: record.name,
    email: record.email,
  };

  res.json({ token: signToken(user), user });
});

let googleClient = null;

function getGoogleClient() {
  googleClient ??= new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return googleClient;
}

// Shared by Google sign-up and Google sign-in: a matching email links the
// Google account to the existing user, otherwise the account is created.
// Existing password accounts keep working - no password is ever set here.
authRouter.post("/google", async (req, res) => {
  const { credential } = req.body ?? {};

  if (typeof credential !== "string" || !credential) {
    return res.status(400).json({ error: "Google credential is required" });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res
      .status(503)
      .json({ error: "Google Sign-In is not configured on the server" });
  }

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("Google credential verification failed:", err.message);
    return res
      .status(401)
      .json({ error: "Google sign-in failed - the credential could not be verified" });
  }

  const { sub: googleId, email: googleEmail, name } = payload ?? {};

  if (!googleId || !googleEmail) {
    return res.status(401).json({ error: "Google account has no usable email" });
  }

  if (payload.email_verified !== true) {
    return res
      .status(401)
      .json({ error: "Google account email is not verified" });
  }

  const users = getDb().collection("users");
  const normalizedEmail = googleEmail.trim().toLowerCase();
  const displayName = (typeof name === "string" && name.trim()) || normalizedEmail.split("@")[0];

  let record = await users.findOne({ email: normalizedEmail });

  if (!record) {
    const { insertedId } = await users.insertOne({
      name: displayName,
      email: normalizedEmail,
      googleId,
      createdAt: new Date(),
    });
    record = { _id: insertedId, name: displayName, email: normalizedEmail };
  } else if (!record.googleId) {
    // First Google sign-in for an existing (password) account - link them.
    await users.updateOne({ _id: record._id }, { $set: { googleId } });
  }

  const user = {
    id: record._id.toString(),
    name: record.name,
    email: record.email,
  };

  res.json({ token: signToken(user), user });
});
