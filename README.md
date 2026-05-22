# Elaris

> Intelligence made persistent.

Elaris distills real people into AI personas — capturing their personality, thinking style, communication patterns, and decision-making frameworks.

## Tech Stack

**Backend:** FastAPI + SQLite + MiniMax-M2.7 API  
**Frontend:** Next.js 16 + Tailwind CSS + Lucide Icons  
**Auth:** JWT + Invite Code only (no public registration)

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 22+
- pnpm

### Backend

```bash
cd backend
cp .env.example .env   # add your MINIMAX_API_KEY
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

### Invite Code

Default invite code for setup: `0T89TXQ8XGAT` (configurable via admin panel)

## Project Structure

```
backend/
  app/
    api/v1/          # API routes (auth, personas, distill, brainstorm, group-chat)
    core/            # Auth, prompts, MiniMax client
    models/          # SQLAlchemy models + Pydantic schemas
    services/        # Business logic (distill, brainstorm, file parsing)
    presets.py       # Pre-seeded personas (14 famous minds)
    main.py          # FastAPI entry point

frontend/
  src/
    app/             # Next.js App Router pages
    components/       # UI components (SoulCard, Avatar, DistillProgress...)
    lib/             # API client, auth store
    store/           # Zustand state
```

## Features

- **Distillation** — Upload files (TXT/PDF/DOCX/CSV) → AI builds a multi-layer personality profile
- **Web Search** — Auto-searches the web to enrich persona knowledge
- **Brainstorm** — Multi-persona moderated discussions with SSE streaming
- **Group Chat** — Chat with multiple personas simultaneously
- **Preset Personas** — 14 pre-built famous minds ready to use