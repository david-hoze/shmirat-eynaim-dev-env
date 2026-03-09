# Authentication

## Token-based auth

Every API request (except `GET /api/stats`) requires a Bearer token in the Authorization header:

```
Authorization: Bearer <64-character hex token>
```

Tokens are 256-bit cryptographically random values, hex-encoded to 64 characters.

## User lifecycle

### Automatic (extension self-registration)

```
1. Extension starts for the first time (no stored token)
2. Extension generates a unique device ID (e.g., "ext-a3f1b2c4...")
3. Extension calls POST /api/register with the device ID
   → Server creates user with status: APPROVED
   → Returns token
4. Extension stores token in browser.storage.local
5. All subsequent API calls use this token automatically
```

Self-registered users are auto-approved. No admin action needed.

### Manual (admin CLI)

```
1. Admin runs:  shmirat-server add-user alice@example.com
   → User created with status: NOT APPROVED
   → Token generated and printed to console

2. Admin runs:  shmirat-server approve alice@example.com
   → User status: APPROVED
   → Token now works for API requests

3. (Optional) Admin runs:  shmirat-server revoke alice@example.com
   → User status: NOT APPROVED
   → Token immediately stops working
```

Admin-created users are NOT approved by default and must be explicitly approved.

## Token validation

On each authenticated request, the server:

1. Extracts the token from the `Authorization: Bearer <token>` header
2. Looks up the token in the users table
3. Checks that the user is approved (`approved = 1`)
4. If any check fails, returns 401 Unauthorized

An unapproved user's token is valid but rejected — the server logs a warning with their email.

## Rate limiting

Each token is limited to **100 requests per minute**. The window is per-calendar-minute (e.g., 12:30:00–12:30:59).

When the limit is exceeded, the server returns:

```json
{ "error": "rate limit exceeded" }
```

with HTTP status 429.

Rate limit entries older than 5 minutes are cleaned up automatically.

## Security considerations

- Tokens are stored in plaintext in the database. This is acceptable for a private/internal server. For public deployment, tokens should be hashed (bcrypt or argon2).
- The API key is never logged to console or returned in API responses.
- HTTPS should be used in production to protect tokens in transit.
- The extension stores the token in `browser.storage.local`, which is sandboxed per-extension.
