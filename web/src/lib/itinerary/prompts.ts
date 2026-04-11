import type { GenerateItineraryRequest } from "@/lib/itinerary/schema";

function describeArea(area: GenerateItineraryRequest["area"]): string {
  if (area.kind === "polygon") {
    return `Area definita come poligono (GeoJSON), coordinate fornite nel contesto.`;
  }
  if (area.kind === "radius") {
    return `Cerchio di circa ${area.radiusKm} km attorno al punto (${area.centerLat.toFixed(4)}, ${area.centerLng.toFixed(4)}).`;
  }
  return `Percorso da "${area.startQuery}" a "${area.endQuery}"${
    area.viaQueries?.length
      ? ` con tappe intermedie: ${area.viaQueries.join(", ")}`
      : ""
  }.`;
}

export function buildPlannerPrompt(req: GenerateItineraryRequest): string {
  const themes = req.preferences.themes.join(", ");
  const time =
    req.time.mode === "days_only"
      ? `${req.time.days} giorni di viaggio (date flessibili — suggerisci periodo migliore per la zona).`
      : `Dal ${req.time.startDate} al ${req.time.endDate} (date fisse).`;

  const transport =
    req.transport === "camper"
      ? "Camper: includi aree di sosta / camper service quando rilevanti."
      : req.transport === "moto"
        ? "Moto: percorsi panoramici quando possibile, parcheggi compatibili."
        : req.transport === "car"
          ? "Auto: parcheggi e comodi spostamenti."
          : "Mezzi pubblici: hub e collegamenti logici.";

  const lang =
    req.language === "it"
      ? "Rispondi in italiano."
      : "Respond in English.";

  return `Sei Roamy, un planner di viaggi stradali. ${lang}

Vincoli utente:
- Temi preferiti (peso simile): ${themes}.
- Ritmo: ${req.preferences.pace}.
- Mezzo: ${req.transport}. ${transport}
- Tempo: ${time}
- Zona geografica: ${describeArea(req.area)}

Restituisci SOLO JSON valido (nessun markdown) con questa forma esatta:
{
  "summary": "stringa breve del piano",
  "bestPeriodNote": "opzionale: periodo migliore se date sono flessibili",
  "days": [
    {
      "dayIndex": 1,
      "label": "opzionale",
      "stops": [
        {
          "title": "nome tappa breve",
          "type": "visit|meal|sleep|parking|camper_stop|scenic|fuel|other",
          "searchQuery": "query precisa per cercare il luogo su Google Maps nella zona",
          "dayIndex": 1,
          "orderInDay": 0,
          "notes": "opzionale"
        }
      ]
    }
  ]
}

Regole:
- Copri tutti i giorni richiesti (dayIndex sequenziale da 1).
- Ogni stop deve avere searchQuery concretamente cercabile (luogo + zona).
- Non inventare coordinate; servono solo titoli e query.
- Massimo ~8 tappe/giorno salvo ritmo "relaxed" (meno tappe).
- Includi pasti dove ha senso (type meal), pernottamento (sleep) se multi-giorno, parcheggio/camper_stop solo se coerenti col mezzo.`;
}

export function buildInsertStopPrompt(
  itineraryJson: string,
  newStopDescription: string,
  lang: "it" | "en"
): string {
  const l =
    lang === "it"
      ? "Italiano. Restituisci SOLO JSON valido con chiavi summary, bestPeriodNote opzionale, days."
      : "English. Return ONLY valid JSON with summary, optional bestPeriodNote, days.";
  return `${l}

Piano attuale (JSON GeminiPlan):
${itineraryJson}

Nuova tappa richiesta: "${newStopDescription}"

Inserisci la tappa nel giorno più logico, riordina orderInDay per ogni giorno. Aggiungi summary aggiornata.
Non rimuovere tappe esistenti. Stesso schema di generate: summary, bestPeriodNote?, days[].dayIndex, label?, stops[].`;
}
