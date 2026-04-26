You are a senior software architect auditing a Next.js SaaS application called TakeasyGO — a multi-tenant restaurant management platform.

Your task is to analyze the entire codebase and produce a structured API Readiness Report. The goal is to determine whether the existing API layer is clean and stable enough to be consumed by an external POS system (offline-capable PWA) without major refactoring.

---

## SCAN SCOPE

Analyze ALL files under:
- /app/api/** (Next.js API routes)
- /lib/** (utilities and services)
- /models/** (data models / Mongoose schemas)
- /hooks/** (may contain data-fetching logic)
- /types/** (TypeScript definitions)
- /middleware.ts

---

## WHAT TO IDENTIFY AND REPORT

### 1. API SURFACE
List every endpoint found under /app/api. For each one report:
- HTTP method (GET, POST, PUT, DELETE, PATCH)
- Route path
- Auth required? (yes / no / unclear)
- Input validation present? (yes / no / partial)
- Response format consistent? (yes / no — check if all return { data, error } or similar)
- Business logic location: (inside route / inside lib service / mixed)

### 2. AUTHENTICATION & AUTHORIZATION
- What auth strategy is used? (NextAuth, JWT, session, custom)
- Is the auth check centralized (middleware) or repeated per route?
- Are there routes without any auth check that should have one?
- Is tenant isolation enforced per request? (i.e., does every query filter by tenant/restaurant ID?)

### 3. BUSINESS LOGIC SEPARATION
- Is business logic inside API route handlers, or extracted to /lib services?
- List all routes where business logic is mixed into the handler (this blocks external reuse)
- Identify any logic that assumes server-side rendering context (e.g., uses cookies, headers, or Next.js-specific APIs that won't work from an external client)

### 4. DATA MODEL REVIEW
- List all Mongoose models found in /models
- For each model, identify: collection name, key fields, relationships (refs to other models)
- Flag any models that mix concerns (e.g., a single model handling both operational and reporting data)
- Is there a clear tenant (restaurant) ID on every model that needs it?

### 5. REAL-TIME READINESS
- Is there any WebSocket or SSE implementation? (look for socket.io, pusher, EventSource, or similar)
- Are there any endpoints that could require real-time updates for a POS use case (orders, kitchen status, payment status)?
- If no real-time layer exists, flag which endpoints would need it for POS

### 6. EXTERNAL CONSUMPTION BLOCKERS
Flag any pattern that would block a PWA/POS from consuming this API:
- CORS not configured
- Auth tied to httpOnly cookies only (no Bearer token support)
- Routes that use Next.js server-only features (getServerSideProps, server actions, cookies())
- Hardcoded internal URLs or environment-specific logic
- Missing or inconsistent error codes (only returning 200 with error in body, etc.)

### 7. OFFLINE SYNC READINESS
Identify endpoints that a POS would need to call for offline sync:
- Which endpoints manage orders? Can they accept bulk or batched writes?
- Is there any timestamp or version field on records (for conflict resolution)?
- Are there any endpoints that could support a "sync since X datetime" pattern?

---

## OUTPUT FORMAT

Return the report in this exact structure:

## API Readiness Report — TakeasyGO

### Summary
[3-sentence overall assessment: ready / partially ready / not ready, and why]

### API Surface (N endpoints found)
[Table: method | route | auth | validation | response consistent | logic location]

### Auth & Tenant Isolation
[Findings]

### Business Logic Separation Score: X/10
[List of routes with mixed logic]

### Data Models
[Table: model name | collection | tenant field present | concerns]

### Real-Time Layer
[Exists / Missing — what's needed]

### External Consumption Blockers
[List with severity: critical / medium / low]

### Offline Sync Readiness
[Findings]

### Recommended Actions (prioritized)
1. [Action] — [why] — [effort: low/medium/high]
2. ...

---

Be direct. Do not soften findings. Flag every blocker even if it requires significant refactoring. The goal is an honest baseline before building a POS on top of this API.