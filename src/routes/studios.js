import { Router } from "express";
import { ObjectId } from "mongodb";

import { getDb } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const studiosRouter = Router();

/** Mirrors StudioCategory in studiospace-client/src/lib/studios.ts. */
const CATEGORIES = ["Photo", "Sound Stage", "Podcast", "Music", "Video"];

const str = (value) => (typeof value === "string" ? value.trim() : "");

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseStudio(body) {
  const errors = [];

  const name = str(body.name);
  const category = str(body.category);
  const tagline = str(body.tagline);
  const description = str(body.description);
  const location = str(body.location);
  const image = str(body.image);
  const pricePerHour = Number(body.pricePerHour);
  const rating = body.rating === undefined ? 0 : Number(body.rating);
  const reviews = body.reviews === undefined ? 0 : Number(body.reviews);

  if (!name) errors.push("Name is required");
  if (!CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if (!tagline) errors.push("Tagline is required");
  if (!description) errors.push("Description is required");
  if (!location) errors.push("Location is required");
  if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
    errors.push("Price per hour must be a positive number");
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    errors.push("Rating must be a number between 0 and 5");
  }
  if (!Number.isInteger(reviews) || reviews < 0) {
    errors.push("Reviews must be a whole number of 0 or more");
  }
  if (!/^https?:\/\//.test(image)) {
    errors.push("Image must be a URL starting with http(s)://");
  }

  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter((item) => str(item)).map(str)
    : [];
  if (amenities.length === 0) {
    errors.push("Add at least one amenity");
  }

  const gallery = Array.isArray(body.gallery)
    ? body.gallery.filter((url) => /^https?:\/\//.test(str(url))).map(str)
    : [];

  if (errors.length) {
    return { errors };
  }

  return {
    errors: [],
    studio: {
      name,
      category,
      tagline,
      description,
      location,
      pricePerHour,
      rating,
      reviews,
      amenities,
      image,
      gallery,
      hero: body.hero === true,
    },
  };
}

async function uniqueSlug(collection, name) {
  const base = slugify(name) || "studio";
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await collection.findOne({ slug }, { projection: { _id: 1 } });
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

studiosRouter.get("/", async (_req, res) => {
  const docs = await getDb()
    .collection("studios")
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.json(
    docs.map((doc) => {
      const { _id, ...rest } = doc;
      return { ...rest, id: _id.toString() };
    }),
  );
});

studiosRouter.get("/mine", requireAuth, async (req, res) => {
  const docs = await getDb()
    .collection("studios")
    .find({ createdBy: req.user.sub })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(
    docs.map((doc) => {
      const { _id, ...rest } = doc;
      return {
        ...rest,
        id: _id.toString(),
        createdAt:
          rest.createdAt instanceof Date
            ? rest.createdAt.toISOString()
            : rest.createdAt,
      };
    }),
  );
});

// Registered after /mine so "mine" is never swallowed by :slug.
studiosRouter.get("/:slug", async (req, res) => {
  const doc = await getDb()
    .collection("studios")
    .findOne({ slug: req.params.slug });

  if (!doc) {
    return res.status(404).json({ error: "Studio not found" });
  }
  const { _id, ...rest } = doc;
  res.json({ ...rest, id: _id.toString() });
});

studiosRouter.put("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid studio id" });
  }

  const { errors, studio } = parseStudio(req.body ?? {});
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const collection = getDb().collection("studios");
  const _id = new ObjectId(id);
  const doc = await collection.findOne({ _id });

  if (!doc) {
    return res.status(404).json({ error: "Studio not found" });
  }
  if (doc.createdBy !== req.user.sub) {
    return res
      .status(403)
      .json({ error: "You can only edit your own studios" });
  }

  // The slug is intentionally left untouched so existing links keep working.
  await collection.updateOne({ _id }, { $set: studio });
  const updated = await collection.findOne({ _id });
  const { _id: updatedId, ...rest } = updated;
  res.json({ ...rest, id: updatedId.toString() });
});

studiosRouter.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid studio id" });
  }

  const collection = getDb().collection("studios");
  const _id = new ObjectId(id);
  const doc = await collection.findOne({ _id });

  if (!doc) {
    return res.status(404).json({ error: "Studio not found" });
  }
  if (doc.createdBy !== req.user.sub) {
    return res
      .status(403)
      .json({ error: "You can only delete your own studios" });
  }

  await collection.deleteOne({ _id });
  res.json({ deleted: true });
});

studiosRouter.post("/", requireAuth, async (req, res) => {
  const { errors, studio } = parseStudio(req.body ?? {});
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const collection = getDb().collection("studios");

  const document = {
    ...studio,
    slug: await uniqueSlug(collection, studio.name),
    createdBy: req.user.sub,
    createdAt: new Date(),
  };

  const { insertedId } = await collection.insertOne(document);
  const { _id, ...created } = document;

  res.status(201).json({ ...created, id: insertedId.toString() });
});
