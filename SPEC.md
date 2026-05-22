# Elaris — Product Rebuild SPEC

## 1. Product Overview & Vision

**Product Name:** Elaris  
**Type:** Social / Messaging-style AI product  
**Core Idea:** Users upload documents about real people, the AI "distills" them into talking virtual personas, then chat 1-on-1 with them, brainstorm in groups, or run multi-persona group discussions.  
**North Star:** Turn any person (boss, colleague, client, historical figure) into a living, conversing digital分身 you can talk to, think with, and write alongside.

**Target Users:**
- Professionals who need to anticipate stakeholder reactions (sales, HR, exec coaches)
- Writers building characters or wanting to "interview" historical figures
- Curious people who want to explore how specific people would think/respond

**What Makes It Different:** The distillation step is the moat — the AI constructs a rich PersonaProfile (mental models, expression DNA, decision heuristics, core tensions) that enables stylistically accurate conversations, not just generic Q&A.

---

## 2. User Tiers

### Free Tier (No login required — or simple invite code)
- ✅ Create up to **3 personas**
- ✅ 1-on-1 chat with any persona
- ✅ Basic file upload + distillation
- ❌ No brainstorm sessions
- ❌ No group chat
- ❌ No API access

### Premium Tier (Paid subscription or invite code unlock)
- ✅ Unlimited personas
- ✅ Brainstorm sessions (multi-persona sequential discussion)
- ✅ Group chat (multi-persona concurrent chat)
- ✅ Priority distillation queue
- ✅ Export personas in multiple formats (Claude, OpenClaw, Codex)
- ✅ Invite codes: 生成自己的邀请码，分享给朋友免费获得Premium

### Entitlement Enforcement
- All brainstorm endpoints (`/brainstorm/**`) require `user.tier == "premium"`
- All group-chat endpoints (`/group-chat/**`) require `user.tier == "premium"`
- Persona CRUD works for both tiers (with quantity limits on free)
- Premium status checked in middleware, not in service layer

---

## 3. Auth Architecture

### Registration Flow
```
Step 1: Enter email
Step 2: Choose method:
  a) Continue with Google → OAuth2 redirect
  b) Continue with X (Twitter) → OAuth2 redirect  
  c) Enter invite code → validate → account created
Step 3: On first login, account auto-created from OAuth sub or invite code
```

### Invite Code Flow
- Admins generate invite codes (one-time use or multi-use) via admin panel or CLI
- Codes stored in `invite_codes` table: `{code, tier, max_uses, used_count, expires_at}`
- Using a code grants the user Premium status (or specified tier)
- Invite code can also be used to skip OAuth entirely — "anonymous" account with just email + code

### Session Tokens
- JWT access tokens (7-day expiry) stored in `HttpOnly` cookie
- Refresh token rotation: issued on login, stored hashed in `refresh_tokens` table
- Token payload: `{sub: user_id, tier, iat, exp}`
- `sub` = user UUID

### OAuth2 Providers
- **Google**: `google_client_id`, `google_client_secret` in `.env`
- **X (Twitter)**: `twitter_client_id`, `twitter_client_secret` in `.env`
- Both use the `python-jose` JWT library already in requirements
- OAuth callback handled at `/auth/callback/{provider}`

### Endpoints
```
GET  /auth/google          → redirect to Google OAuth
GET  /auth/google/callback → exchange code, create session, set cookie
GET  /auth/twitter         → redirect to Twitter OAuth
GET  /auth/twitter/callback → exchange code, create session, set cookie
POST /auth/register        → {email, password, invite_code?} → create account
POST /auth/login           → {email, password} → issue tokens
POST /auth/logout          → invalidate refresh token
POST /auth/refresh         → rotate refresh token → new access token
GET  /auth/me              → current user info (requires auth cookie)
POST /auth/invite-code     → (admin) generate an invite code
```

---

## 4. Database Schema Changes

### New Tables

#### `users`
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,          -- UUID
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,            -- NULL for OAuth-only accounts
  name TEXT,
  avatar_url TEXT,
  tier TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'premium'
  invite_code TEXT,              -- the code they used to register (if any)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
```

#### `sessions` (JWT sessions tracking)
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID
  user_id TEXT NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

#### `invite_codes`
```sql
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'premium',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Schema Changes to Existing Tables

#### `personas` — add `user_id`
```sql
ALTER TABLE personas ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE INDEX idx_personas_user ON personas(user_id);
```
Every persona is now owned by exactly one user. Existing personas (created before auth) can be migrated to `user_id = 'anonymous'`.

#### `brainstorm_sessions` — add `user_id`
```sql
ALTER TABLE brainstorm_sessions ADD COLUMN user_id TEXT REFERENCES users(id);
```

#### `group_chats` — add `user_id`
```sql
ALTER TABLE group_chats ADD COLUMN user_id TEXT REFERENCES users(id);
```

---

## 5. API Endpoint Changes

### Auth Endpoints (new, prefix `/api/v1/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/google` | ❌ | Redirect to Google OAuth |
| GET | `/auth/google/callback` | ❌ | Google OAuth callback |
| GET | `/auth/twitter` | ❌ | Redirect to X/Twitter OAuth |
| GET | `/auth/twitter/callback` | ❌ | Twitter OAuth callback |
| POST | `/auth/register` | ❌ | Email + password + optional invite code |
| POST | `/auth/login` | ❌ | Email + password → JWT |
| POST | `/auth/logout` | ✅ | Invalidate refresh token |
| POST | `/auth/refresh` | ❌ | Rotate refresh token |
| GET | `/auth/me` | ✅ | Get current user profile |

### Persona Endpoints (modified)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/personas` | ✅ | Auto-assign `user_id` from JWT |
| GET | `/personas` | ✅ | Filter by `user_id` |
| GET | `/personas/{id}` | ✅ | Verify `user_id` ownership |
| PUT | `/personas/{id}` | ✅ | Verify ownership |
| DELETE | `/personas/{id}` | ✅ | Verify ownership |
| POST | `/personas/{id}/files` | ✅ | Verify ownership |
| POST | `/personas/{id}/distill` | ✅ | Verify ownership |
| GET | `/personas/{id}/soul` | ✅ | Verify ownership |
| POST | `/personas/{id}/chat` | ✅ | Verify ownership |
| POST | `/personas/{id}/brainstorm` | **Premium** | Verify ownership + tier |
| POST | `/personas/{id}/group-chat` | **Premium** | Verify ownership + tier |

### Chat Endpoints (modified — moved under `/personas/{id}/chat`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/personas/{id}/chat` | ✅ | 1-on-1 chat (free tier OK) |
| POST | `/personas/{id}/write` | ✅ | Write mode (free tier OK) |
| POST | `/personas/{id}/advise` | ✅ | Advise mode (free tier OK) |

### Brainstorm Endpoints (existing, move to `/api/v1/brainstorm`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/brainstorm` | **Premium** | Create session |
| GET | `/brainstorm` | **Premium** | List user's sessions |
| GET | `/brainstorm/{id}` | **Premium** | Get session detail |
| DELETE | `/brainstorm/{id}` | **Premium** | Delete session |
| POST | `/brainstorm/{id}/start` | **Premium** | Start discussion |
| SSE | `/brainstorm/{id}/sse` | **Premium** | SSE stream |
| POST | `/brainstorm/{id}/export` | **Premium** | Export |

### Group Chat Endpoints (existing, move to `/api/v1/group-chat`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/group-chat` | **Premium** | Create chat |
| GET | `/group-chat` | **Premium** | List user's chats |
| GET | `/group-chat/{id}` | **Premium** | Get chat detail |
| DELETE | `/group-chat/{id}` | **Premium** | Delete chat |
| POST | `/group-chat/{id}/send` | **Premium** | Send message (blocking) |
| SSE | `/group-chat/{id}/sse` | **Premium** | SSE stream |

### Admin Endpoints
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/admin/invite-codes` | **Admin** | Generate invite code |

---

## 6. Backend Middleware

### `AuthMiddleware` (applied globally except `/auth/**` and `/health`)
- Reads `Authorization: Bearer <token>` header OR `access_token` cookie
- Validates JWT signature and expiry
- Attaches `request.state.user = {id, email, tier}` to every request
- Returns 401 if token invalid/expired

### `@require_auth` dependency
```python
async def require_auth(request: Request) -> User:
    if not hasattr(request.state, "user"):
        raise HTTPException(401, "Authentication required")
    return request.state.user
```

### `@require_tier(tier: str)` dependency
```python
def require_tier(tier: str):
    async def _check(user: User = Depends(require_auth)):
        if user.tier != tier and user.tier != "admin":
            raise HTTPException(403, f"Premium required. Upgrade or use an invite code.")
        return user
    return _check
```

### `@require_owner(model, id_param)` dependency
- Verifies `request.state.user.id` owns the resource before allowing write operations

---

## 7. Frontend Pages

### `/app/(auth)/login/page.tsx`
- Email/password login form
- "Continue with Google" button
- "Continue with X" button
- "Have an invite code?" collapsible form

### `/app/(auth)/register/page.tsx`
- Email + password + name
- Invite code field (optional — grants Premium)
- "Already have an account? Login"

### `/app/(auth)/layout.tsx`
- No sidebar, centered card layout for auth pages

### `/app/(app)/layout.tsx`
- Authenticated layout with sidebar nav
- Sidebar shows: Home, My Personas, Brainstorms (Premium badge), Group Chats (Premium badge), Settings
- Premium upsell banner when free-tier user visits premium pages

### `/app/(app)/page.tsx` (Dashboard)
- Welcome message with user name
- Stats: personas count, recent activity
- Quick actions: Create persona, Continue recent chat

### `/app/(app)/personas/page.tsx`
- Grid of persona cards (filtered to current user)
- "Create new" button
- Search/filter by name

### `/app/(app)/personas/[id]/page.tsx`
- Persona detail + chat interface
- Tabs: Chat / Write / Advise
- "Distill" button to regenerate soul
- "Brainstorm" button (premium lock if not tier)
- "Group Chat" button (premium lock if not tier)

### `/app/(app)/brainstorms/page.tsx`
- List of brainstorm sessions (Premium only, shows upgrade prompt for free)
- "Start new brainstorm" → opens modal to pick personas + topic

### `/app/(app)/brainstorms/[id]/page.tsx`
- SSE-connected brainstorm view: topic header, message thread, summary panel

### `/app/(app)/group-chat/page.tsx`
- List of group chats (Premium only)
- "New group chat" → persona picker + title

### `/app/(app)/group-chat/[id]/page.tsx`
- Group chat SSE view: message thread, persona indicators

### `/app/(app)/settings/page.tsx`
- Profile: name, avatar (Gravatar or upload)
- Security: change password (if set)
- Subscription: tier status, invite code display, "Upgrade to Premium" button

### `/app/(app)/premium/page.tsx`
- Premium upgrade page: features, pricing (if Stripe added later), or "Redeem invite code"

### Auth Flow (frontend)
```
Unauthenticated user → / → redirect to /login
/login → user logs in → redirect to /
/personas/new → if not authed → redirect to /login
/brainstorm/* → if free tier → show upsell modal
```

---

## 8. Code to Preserve (Do Not Discard)

### Backend Services (keep as-is, may need minor adaptors)
- `app/services/distill_service.py` — distillation logic (core IP)
- `app/services/file_parser.py` — PDF/DOCX/TXT parsing
- `app/services/brainstorm_service.py` — brainstorm orchestration
- `app/services/brainstorm_export.py` — DOCX export
- `app/services/group_chat_service.py` — group chat orchestration
- `app/services/persona_service.py` — persona CRUD
- `app/core/minimax_client.py` — MiniMax API client
- `app/core/prompts.py` — prompt templates
- `app/core/group_chat_prompts.py` — group chat prompt templates
- `app/models/schemas.py` — Pydantic schemas (extend, don't replace)
- `app/models/db_models.py` — SQLAlchemy models (extend, don't replace)

### Frontend Components (keep as-is)
- `src/components/Avatar.tsx`
- `src/components/FileUploader.tsx`
- `src/components/ManualInputForm.tsx`
- `src/components/SoulCard.tsx`
- `src/components/DistillProgress.tsx`
- `src/components/WebSearchPanel.tsx`
- `src/lib/api.ts` — extend with auth endpoints
- `src/store/index.ts` — extend with user/auth state

### Database
- SQLite file: `backend/persona_distiller.db` — migration needed (add columns, not drop+recreate)

---

## 9. Implementation Priority Order

### Phase 1: Auth Foundation
1. Add `users`, `sessions`, `invite_codes` tables to `db_models.py`
2. Implement JWT utilities (`app/core/auth.py`) — sign/verify tokens, hash passwords
3. Implement invite code generation and validation
4. Create `AuthMiddleware` and `require_auth` / `require_tier` dependencies
5. Build all auth API routes (`/auth/**`)
6. Write migration script to add `user_id` columns to existing tables
7. Add `user_id` to all persona/brainstorm/group-chat writes

### Phase 2: Frontend Auth Pages
8. Build `/login` and `/register` pages
9. Build auth layout + context (Zustand auth store slice)
10. Add auth headers to all API calls (cookie-based)
11. Protect all `/app/(app)/` routes with auth guard
12. Show upsell modal/banner for free-tier users on premium features

### Phase 3: Premium Gating
13. Add `@require_tier("premium")` to brainstorm endpoints
14. Add `@require_tier("premium")` to group-chat endpoints
15. Add tier checks to persona count limits (free: 3 personas)
16. Add "Upgrade to Premium" flow + invite code redemption

### Phase 4: Social Features (if scope expands)
17. Share persona via link (`/shared/persona/{id}?token=...`)
18. "View其他人's personas" — future consideration

### Migration Notes
- **DO NOT drop any existing tables** — run `ALTER TABLE` migrations
- Existing personas without `user_id` should be owned by a special `NULL`-user or migrate to the user's first created account
- JWT secret must be rotated — old secret invalidated on first deployment
- SQLite WAL mode already enabled — safe for concurrent reads

---

## 10. Tech Stack Summary

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend | FastAPI (Python async) | Already using SQLAlchemy async + aiosqlite |
| Auth | python-jose + passlib | Already in requirements.txt |
| OAuth | httpx | Used for Google + Twitter OAuth token exchange |
| Database | SQLite (WAL) | `persona_distiller.db`, migrate to add user tables |
| Frontend | Next.js 16 App Router | Already using Zustand, Tailwind |
| State | Zustand | Extend `useAppStore` with `user` + `auth` slice |
| AI | MiniMax API | Already integrated via `minimax_client.py` |
| Sessions | JWT in HttpOnly cookie | Already have JWT config in settings |
| File uploads | Local disk (`/uploads`) | Keep, add per-user subdirectories |