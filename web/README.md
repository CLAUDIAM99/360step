# Roamy (Next.js)

App principale: wizard itinerari con **Gemini**, **Google Maps Platform** (grounding) e **Open-Meteo**.

## Sviluppo locale

```bash
cd web
cp .env.example .env.local
# Compila GEMINI_API_KEY, GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Deploy su Vercel

1. Crea un progetto collegato a questo repository.
2. Imposta **Root Directory** su `web`.
3. Aggiungi le variabili d’ambiente (vedi `.env.example`).

Abilita in Google Cloud Console: **Maps JavaScript API**, **Geocoding API**, **Places API**, **Directions API** (e fatturazione dove richiesto).

## Script dalla root del monorepo

```bash
npm run dev    # equivale a cd web && npm run dev
npm run build
```
