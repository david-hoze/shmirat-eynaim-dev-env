# API Specification

Base URL: `http://<host>:8080`

All endpoints return JSON. All endpoints except `/api/stats` require authentication via Bearer token.

## Endpoints

### GET /api/stats

Public server statistics. No authentication required.

**Response:**
```json
{
  "classifications": 12847,
  "descriptors": 3201,
  "approvedUsers": 5
}
```

### GET /api/classifications/:hash

Look up a classification by image hash.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "hash": "abc123",
  "containsWomen": true,
  "confidence": 0.92,
  "voteBlock": 7,
  "voteSafe": 1,
  "source": "haiku"
}
```

**Response (404):**
```json
{ "error": "classification not found" }
```

The client should check vote counts before trusting the result. A suggested threshold: `voteBlock + voteSafe >= 2`.

### POST /api/classifications

Submit a classification result.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "hash": "abc123",
  "containsWomen": true,
  "source": "haiku",
  "confidence": 0.9
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| hash | string | yes | Perceptual hash of the image |
| containsWomen | boolean | yes | Classification result |
| source | string | yes | Origin: `"haiku"`, `"local"`, `"user"` |
| confidence | number | yes | 0.0 to 1.0 |

**Behavior:**
- If the hash doesn't exist, creates a new record with initial vote counts.
- If the hash already exists, increments the appropriate vote counter (`voteBlock` or `voteSafe`) and averages the confidence.
- Increments the submitting user's contribution count.

**Response (200):**
```json
{ "success": true }
```

### POST /api/classifications/batch

Look up multiple classifications in one request. Useful when a page loads many images at once.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "hashes": ["abc123", "def456", "ghi789"]
}
```

**Response (200):**
```json
{
  "results": {
    "abc123": {
      "containsWomen": true,
      "confidence": 0.92,
      "voteBlock": 7,
      "voteSafe": 1,
      "source": "haiku"
    },
    "def456": {
      "containsWomen": false,
      "confidence": 0.88,
      "voteBlock": 0,
      "voteSafe": 3,
      "source": "local"
    }
  }
}
```

Hashes not found in the database are omitted from the results object.

### GET /api/descriptors

Retrieve shared face descriptors for bootstrapping the local learning system.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "descriptors": [
    {
      "id": 1,
      "descriptor": "<base64-encoded 128-dim float array>",
      "label": "block",
      "confidence": 0.95,
      "contributorCount": 3
    }
  ]
}
```

Returns the 100 most recently updated descriptors. The `descriptor` field is a base64-encoded binary blob (128 x float32 = 512 bytes raw).

### POST /api/descriptors

Submit a face descriptor from the local learning system.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "descriptor": "<base64-encoded 128-dim float array>",
  "label": "block",
  "confidence": 0.9
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| descriptor | string | yes | Base64-encoded face descriptor (512 bytes) |
| label | string | yes | `"block"` or `"safe"` |
| confidence | number | yes | 0.0 to 1.0 |

**Response (200):**
```json
{ "success": true }
```

## Error Responses

All errors follow the same format:

```json
{ "error": "description of the problem" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing fields, invalid JSON |
| 401 | Unauthorized — missing, invalid, or unapproved token |
| 404 | Not found — unknown endpoint or missing resource |
| 429 | Too many requests — rate limit exceeded |

## CORS

All responses include CORS headers allowing cross-origin requests from browser extensions:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

OPTIONS preflight requests return 204 with these headers.
