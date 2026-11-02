import { Router } from "express";
import { ObjectId } from "mongodb";

import { getDb } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const bookingsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function parseBooking(body) {
  const errors = [];
  const str = (value) => (typeof value === "string" ? value.trim() : "");

  const studioSlug = str(body.studioSlug);
  const studioName = str(body.studioName);
  const studioImage = str(body.studioImage);
  const pricePerHour = Number(body.pricePerHour);
  const hours = Number(body.hours);
  const date = str(body.date);

  if (!studioSlug) errors.push("Studio is required");
  if (!studioName) errors.push("Studio name is required");
  if (!/^https?:\/\//.test(studioImage)) {
    errors.push("Studio image must be a URL starting with http(s)://");
  }
  if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
    errors.push("Price per hour must be a positive number");
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
    errors.push("Hours must be a whole number between 1 and 12");
  }
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    errors.push("Date must be a valid calendar date (YYYY-MM-DD)");
  } else if (date < todayUtc()) {
    errors.push("Date cannot be in the past");
  }

  if (errors.length) return { errors };

  return {
    errors: [],
    booking: {
      studioSlug,
      studioName,
      studioImage,
      pricePerHour,
      hours,
      date,
      // Total is always computed server-side from the hours and rate.
      totalPrice: Math.round(pricePerHour * hours * 100) / 100,
    },
  };
}

function withId(doc) {
  const { _id, createdAt, ...rest } = doc;
  return {
    ...rest,
    id: _id.toString(),
    createdAt:
      createdAt instanceof Date ? createdAt.toISOString() : createdAt,
  };
}

bookingsRouter.post("/", requireAuth, async (req, res) => {
  const { errors, booking } = parseBooking(req.body ?? {});
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }


  const document = {
    ...booking,
    userId: req.user.sub,
    userEmail: req.user.email ?? null,
    // New reservations start as "pending" per the booking workflow.
    status: "pending",
    createdAt: new Date(),
  };

  const { insertedId } = await getDb()
    .collection("bookings")
    .insertOne(document);

  res.status(201).json({ ...withId(document), id: insertedId.toString() });
});

bookingsRouter.get("/mine", requireAuth, async (req, res) => {
  const docs = await getDb()
    .collection("bookings")
    .find({ userId: req.user.sub })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(docs.map(withId));
});

bookingsRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const collection = getDb().collection("bookings");
  const _id = new ObjectId(id);
  const doc = await collection.findOne({ _id });

  if (!doc) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (doc.userId !== req.user.sub) {
    return res
      .status(403)
      .json({ error: "You can only cancel your own bookings" });
  }
  if (!["pending", "confirmed"].includes(doc.status)) {
    return res
      .status(400)
      .json({ error: "This booking is no longer active" });
  }

  await collection.updateOne(
    { _id },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
  );
  const updated = await collection.findOne({ _id });
  res.json(withId(updated));
});
