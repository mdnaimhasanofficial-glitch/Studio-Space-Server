# StudioSpace — Backend API

REST API for **StudioSpace**, a peer-to-peer marketplace where creators discover and book photography, film, podcast, music and workshop studios.

## Tech Stack

- **Node.js + Express 5** (ES modules)
- **MongoDB** (official driver, Atlas-ready)
- **JWT authentication** — issued as an **HTTPOnly cookie** and also accepted as a `Bearer` token
- **bcryptjs** password hashing, **google-auth-library** for Google Sign-In

## Local Setup

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev            # or: npm start
```

The server listens on `PORT` (default `5000`).

## Environment Variables

| Key | Description |
| --- | --- |
| `PORT` | HTTP port (default 5000) |
| `MONGODB_URI` | MongoDB connection string (Atlas or local) |
| `JWT_SECRET` | Long random string used to sign JWTs |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Sign-In verification |

## API Overview

### Auth — `/api/auth`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | — | Create account (name, email, password — uppercase + lowercase + 6+ chars) |
| POST | `/login` | — | Email + password login |
| POST | `/google` | — | Verify Google ID token credential, link/create account |
| POST | `/logout` | — | Clear the HTTPOnly auth cookie |

All successful auth responses also set the JWT as an **HTTPOnly cookie** (`studiospace_token`, 7 days).

### Studios — `/api/studios`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | — | All studios (newest first) |
| GET | `/mine` | ✅ | Studios owned by the signed-in user |
| GET | `/:slug` | — | Single studio by slug |
| POST | `/` | ✅ | Create studio (validated; ownership enforced) |
| PUT | `/:id` | ✅ | Update studio — owner only (403 otherwise) |
| DELETE | `/:id` | ✅ | Delete studio — owner only (403 otherwise) |

Unauthorized mutations are rejected with **401**; foreign documents with **403**.

### Bookings — `/api/bookings`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/` | ✅ | Create booking — starts as `pending`. Rejects with **409** when the studio already has an active (pending/confirmed) booking on that date (double-booking prevention) |
| GET | `/mine` | ✅ | Current user's bookings |
| POST | `/:id/cancel` | ✅ | Cancel an active booking (owner only) |

Fields validated per request: date must be `YYYY-MM-DD` (no past dates), hours 1–12, totals are always computed server-side.
