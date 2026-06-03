# AssiniLang

Synthetic language evaluation scaffold for a community-governed language AI system.

This repository intentionally starts with made-up languages only. No real First Nations or Indigenous language data belongs in this milestone.

## Local Setup

```powershell
npm install
npm test
```

At the Task 1 foundation stage, this installs the root workspace dependencies and verifies the empty test baseline.

## After the Scaffold Is Implemented

```powershell
npm run seed
npm run eval
npm run dev
```

Open the web app at `http://localhost:5173`. The API runs at `http://localhost:4321`.

### One-Command Demo

```powershell
npm run demo
```

Once the scaffold packages and apps are implemented, the demo seeds synthetic fixtures, runs evaluation, and starts the API plus web app.

## Project Shape

- `packages/db`: shared schemas and local JSON persistence.
- `packages/synthetic-langs`: invented languages, corpora, grammar notes, and answer keys.
- `packages/eval`: deterministic study-loop simulation and scoring.
- `apps/api`: Fastify API.
- `apps/web`: Vite React prototype UI.
