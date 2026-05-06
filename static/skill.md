---
name: haradato
description: Help a human use Haradato - Harada-chart life goals, tasks (incl. todo lists), and markdown notes - via the browser app plus the MLAuth-signed agent HTTP API.
version: 1.0.0
website: https://www.haradato.com
---

# Haradato agent skill

Haradato is a **goals + tasks + notes** workspace for humans: a **9×9 Harada chart** (life-goal cells), **tasks** (goal-linked or custom lists), and **markdown notes**. Your job is to help a **human** get value from these in the way they want - whether they care about one surface (e.g. todos only) or all three.

This skill covers **(1) human onboarding** in the app and **(2) optional programmatic access** once the human approves your MLAuth identity.

## What the human gets

| Mode | In the app | Agent API (after approval) |
|------|------------|----------------------------|
| **Life goals** | Edit cells on the Harada chart (title, description, status, color). Center cell is commonly **E5** (grid index `40`); other cells use chess-like addresses (**A1**–**I9**) or indices `0`–`80`. | `GET/POST /api/agent/goals`, `GET/PATCH/DELETE /api/agent/goals/[goalIndex]` |
| **Todo list** | Tasks on a goal or a **custom list** (named list, not tied to the chart). | `GET/POST /api/agent/tasks`, `GET/PATCH/DELETE /api/agent/tasks/[taskId]` |
| **Markdown notes** | Standalone notes; content is markdown. Optional link to a goal index when creating. | `GET/POST /api/agent/notes`, `GET/PATCH/DELETE /api/agent/notes/[noteId]` |

Humans use the **same account** for all three; there is no separate “modes” switch - you align with what they ask for.

## Setup options

Use one of these two flows.

### Option A - Human-first setup (existing account path)

1. **Account** - The human signs up / signs in at **https://www.haradato.com** with the email they treat as their primary Haradato identity.
2. **Clarify intent** - Ask whether they care about:
   - **Chart / life goals** only or primarily  
   - **Tasks / todos** (simple lists vs tied to chart goals)  
   - **Notes** (markdown capture, journaling, etc.)  
   - Or **everything**.
3. **Walk through the UI** - They work in the web app (or native app if installed). Encourage at least one goal cell, task, or note so data exists before you rely on the API.
4. **Agent access (optional)** - If you need to read or write data on their behalf, continue to **Agent API access** below.

### Option B - Agentic setup (agent creates or attaches account)

1. **Ensure MLAuth identity exists first** - If your `dumbname` is not registered on MLAuth, register there first (Haradato verifies against MLAuth public keys).
2. **Create/attach human account** - Call `POST /api/agent/sign-up` with `human_email` and a signed `message` of `SIGNUP:{human_email}`.
3. **Human confirmation** - Tell the human to open Haradato with that email and approve your access in **Settings → AI agent access**.
4. **Proceed to data APIs** - After approval, use goals/tasks/notes endpoints.

## Agent API access (MLAuth)

Haradato identifies **agents** with [MLAuth](https://mlauth.ai/skill.md) (`dumbname` + ECDSA P-256 / secp256k1 signatures). The **human** is identified by their **Haradato login email** (normalized: trimmed, lowercased).

**Base URL:** `https://www.haradato.com/api/agent/`

### Operational rules

1. **Never** send a private key to Haradato or any third party. Sign locally; only send `dumbname`, `timestamp`, `signature`, and payloads.
2. **Signing string:** `message` in the protocol is the *action-specific* suffix. The signed octets are always:
   ```text
   {dumbname}{ISO8601_UTC_timestamp}{message}
   ```
   Algorithm: **ECDSA with SHA-256**. Signature: **base64 single line** (`openssl base64 -A` on macOS/Linux).
3. **Freshness:** timestamp must be within **±5 minutes** of server time.
4. **Approval:** The human must turn on **Settings → AI agent access** and **Approve** your `dumbname` after you request access. Without that, all data calls return **403**.

### Quick shell pattern

```bash
# Identity directory (example)
MLAUTH_DIR="$HOME/.mlauth/haradato"
DUMBNAME="$(tr -d '\r\n' < "$MLAUTH_DIR/dumbname.txt")"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
# message=... set per endpoint below
SIG="$(printf '%s' "${DUMBNAME}${TS}${MESSAGE}" | openssl dgst -sha256 -sign "$MLAUTH_DIR/private.pem" | openssl base64 -A)"
```

### Bootstrap endpoints

| Step | Method & path | `message` (exact) | Body / query |
|------|----------------|-------------------|--------------|
| Sanity check / agentic signup | `POST …/sign-up` | `SIGNUP` **or** `SIGNUP:{human_email}` | JSON: `dumbname`, `timestamp`, `signature`, `message`, optional `human_email` |
| Ask for access | `POST …/request-access` | `REQUEST_ACCESS:{human_email}` | JSON: `human_email`, `dumbname`, `timestamp`, `signature`, `message` |

After `request-access`, tell the human to open **Settings → AI agent access**, enable access, and tap **Approve** next to your agent name. The JSON response includes guidance text you can surface verbatim.

### Signed `message` patterns for data APIs

**Stable JSON:** For payloads that embed JSON, Haradato uses **sorted keys, deterministic nesting** (see `stableStringify` semantics: object keys sorted lexicographically; same rules you must use when building `message`).

**GET / DELETE** (and MLAuth-only query): pass `human_email`, `dumbname`, `timestamp`, `signature`, `message` as **query parameters**.

**POST / PATCH**: same MLAuth fields in the **JSON body** with the rest of the payload.

| Resource | Operations | `message` format |
|----------|------------|------------------|
| **Goals** | List / read grid | `GOALS_GET:{human_email}` or `GOALS_GET:{human_email}:{goal_ref}` (`goal_ref` = same as query or path, e.g. `40` or `E5`) |
| | Create / update cell | `GOALS_POST:{human_email}:{stable}` where `stable` is sorted JSON of `goal_index`, `text`, `readme`, `status`, `color` (nulls allowed for unused fields) |
| | Patch cell | `GOALS_PATCH:{human_email}:{goal_ref}:{stable}` - `stable` = sorted JSON of only fields present (`text`, `readme`, `status`, `color`) |
| | Clear cell | `GOALS_DELETE:{human_email}:{goal_ref}` (query) |
| **Tasks** | List | `TASKS_GET:{human_email}` |
| | Read one | `TASKS_GET:{human_email}:{task_id}` |
| | Create / upsert | `TASKS_POST:{human_email}:{stable}` - `stable` from task fields (`id`, `title`, `markdown`, `status`, `list_type`, `list_id`, `list_name`, `goal_index`, `parent_id`, `ordering`, `pinned`) |
| | Patch | `TASKS_PATCH:{human_email}:{task_id}:{stable}` |
| | Soft-delete | `TASKS_DELETE:{human_email}:{task_id}` (query) |
| **Notes** | List | `NOTES_GET:{human_email}` |
| | Read one | `NOTES_GET:{human_email}:{note_id}` |
| | Create / upsert | `NOTES_POST:{human_email}:{stable}` - `stable` from `id`, `content`, `goal_index` |
| | Patch | `NOTES_PATCH:{human_email}:{note_id}:{stable}` |
| | Soft-delete | `NOTES_DELETE:{human_email}:{note_id}` (query) |

Paths (relative to base):

- `…/goals`, `…/goals/[goalIndex]`
- `…/tasks`, `…/tasks/[taskId]`
- `…/notes`, `…/notes/[noteId]`

### Matching setup to human intent

- **Todos only** - Prefer **tasks** with `list_type: "custom"` and a friendly `list_name`, or attach to a single goal index if they already care about one chart cell.
- **Notes only** - Use **notes**; store markdown in `content`. First line is often treated as a title in the UI.
- **Life goals** - Use **goals**; set `text` (title), `readme` (longer description), `status` (`todo` | `done`), `color` as supported by the app.
- **All three** - Combine calls; **goal_index** links tasks and optional note metadata to chart cells.

### Errors worth explaining to the human

| Code / HTTP | Meaning |
|-------------|---------|
| `403` + agent not approved | They must enable AI agent access and **Approve** your dumbname. |
| `404` + user not found | `human_email` does not match a Haradato account. |
| `401` | Bad or stale MLAuth signature / timestamp / revoked key. |

## Haradato as an MLAuth karma provider

Haradato is registered on MLAuth as a karma provider. Provider metadata and domain proof live at **https://www.haradato.com/mlauth.json**. Service listing: see [MLAuth services](https://mlauth.ai/services).

## Links

- App: **https://www.haradato.com**
- This skill (same content): **https://www.haradato.com/skill.md**
- MLAuth identity: **https://mlauth.ai/skill.md**
- MLAuth OpenAPI: **https://mlauth.ai/api/openapi.json**
