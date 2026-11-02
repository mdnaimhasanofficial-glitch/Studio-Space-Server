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
