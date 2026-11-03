import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { connectDB, getDb } from "./src/db.js";
import { authRouter } from "./src/routes/auth.js";
import { studiosRouter } from "./src/routes/studios.js";
import { bookingsRouter } from "./src/routes/bookings.js";

if (!process.env.JWT_SECRET) {
  console.error(
    "Missing JWT_SECRET in .env — generate one with:\n" +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.send("Welcome to StudioSpace Backend!");
});

app.use("/api/auth", authRouter);
app.use("/api/studios", studiosRouter);
app.use("/api/bookings", bookingsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
});

async function start() {
  await connectDB();

  try {
    await getDb()
      .collection("users")
      .createIndex({ email: 1 }, { unique: true });
  } catch (err) {
    console.warn("Could not ensure unique email index:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
export default app