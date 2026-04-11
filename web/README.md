# Roamy (Next.js)

App principale: wizard itinerari con **Gemini**, **Google Maps Platform** (grounding) e **Open-Meteo**.

## Sviluppo locale

```bash
# Dalla root del repo (workspaces npm)
cp web/.env.example web/.env.local
# Compila GEMINI_API_KEY, GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Deploy su Vercel

Il repo include [`vercel.json`](../vercel.json) alla root con `installCommand` / `buildCommand` che puntano a `web/`: **non serve** impostare “Root Directory” su `web` se importi il repo dalla root.

1. [Vercel](https://vercel.com/new) → Import del repository GitHub.
2. Variabili d’ambiente (Production + Preview): vedi [`web/.env.example`](.env.example) (`GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, …).
3. (Opzionale) Deploy da GitHub Actions: aggiungi i secret `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — vedi [`.github/workflows/vercel-production.yml`](../.github/workflows/vercel-production.yml).

Abilita in Google Cloud: **Maps JavaScript**, **Geocoding**, **Places**, **Directions** (e fatturazione se richiesta).

## Script dalla root del monorepo

```bash
npm run dev    # equivale a cd web && npm run dev
npm run build
```
