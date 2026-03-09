# Data Model

## Entities

### Users

Registered API consumers. Each user has a unique email, a unique token, and an approval status.

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Auto-increment primary key |
| email | text, unique | User identifier |
| token | text, unique | 64-char hex API token |
| approved | integer | 0 = pending, 1 = approved |
| contribution_count | integer | Number of classifications submitted |
| created_at | datetime | Account creation timestamp |

### Classifications

Shared image classification results, keyed by perceptual hash.

| Field | Type | Description |
|-------|------|-------------|
| hash | text, primary key | Perceptual hash of the image |
| contains_women | integer | 1 = yes, 0 = no |
| confidence | real | Averaged confidence score (0.0–1.0) |
| vote_block | integer | Number of users who classified as "block" |
| vote_safe | integer | Number of users who classified as "safe" |
| source | text | Origin of the first classification |
| first_seen | datetime | When this hash was first submitted |
| last_updated | datetime | Most recent update |

**Voting behavior:** When a new classification is submitted for an existing hash:
- The appropriate vote counter is incremented
- Confidence is averaged: `new_confidence = (submitted + existing) / 2`
- `last_updated` is refreshed
- An individual vote record is stored in the Votes table (see below)

### Votes

Individual vote audit log. Each submission is recorded with full context — who voted, what source they used, and when. The Classifications table is the aggregated view; this table is the raw record.

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Auto-increment primary key |
| hash | text | Image hash (references classifications) |
| user_id | integer | Who cast this vote (references users) |
| contains_women | integer | 1 = yes, 0 = no |
| confidence | real | Source confidence (0.0–1.0) |
| source | text | `"local"`, `"haiku"`, or `"user"` |
| created_at | datetime | When the vote was cast |

**Constraints:**
- `UNIQUE(hash, user_id)` — one vote per user per image. If the same user re-classifies (e.g., local ML first, then Haiku overrides), the vote is updated in place with the latest source and confidence.
- Indexed on `hash` for efficient lookups.

### Descriptors

Shared face descriptor vectors for bootstrapping the KNN learning system.

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Auto-increment primary key |
| descriptor | blob | 128-dimensional float32 array (512 bytes raw) |
| label | text | `"block"` or `"safe"` |
| confidence | real | Source confidence (0.0–1.0) |
| contributor_count | integer | Number of users who contributed this descriptor |
| first_seen | datetime | When first submitted |
| last_updated | datetime | Most recent update |

### Rate Limits

Per-token, per-minute request counters.

| Field | Type | Description |
|-------|------|-------------|
| token | text | API token (compound PK) |
| window_start | datetime | Minute window start (compound PK) |
| count | integer | Requests in this window |

Entries older than 5 minutes are automatically cleaned up.

## Data flow

```
Extension classifies image
       │
       ├─ Hash the image (perceptual hash)
       │
       ├─ POST /api/classifications/batch {hashes: [...]}
       │   → Server returns known classifications
       │   → Extension skips ML for known images
       │
       ├─ Run local ML on unknown images
       │
       ├─ POST /api/classifications {hash, containsWomen, ...}
       │   → Server stores/updates aggregated result, increments votes
       │   → Individual vote logged in votes table with source and user
       │
       └─ POST /api/descriptors {descriptor, label, ...}
           → Server stores face descriptor for shared learning
```

## Trust and consensus

The server does not decide truth. It stores votes. The extension client decides how to interpret the votes:

- **Low votes** (< 2 total): Treat as untrusted, run local ML anyway
- **Strong consensus** (e.g., 5 block, 0 safe): Trust the result, skip ML
- **Contested** (e.g., 3 block, 2 safe): Run local ML, add your vote

The threshold policy is a client-side decision, not enforced by the server.
