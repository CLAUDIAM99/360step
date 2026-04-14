import type { GenerateItineraryRequest } from "@/lib/itinerary/schema";
import { boundsFromArea } from "@/lib/maps/bounds";
import { deriveDailyBudget } from "@/lib/itinerary/pace-budgets";

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

function describeAreaBounds(area: GenerateItineraryRequest["area"]): string {
  const b = boundsFromArea(area);
  return `Riferimento geografico (gradi decimali): latitudine da ${b.south.toFixed(3)} a ${b.north.toFixed(3)}, longitudine da ${b.west.toFixed(3)} a ${b.east.toFixed(3)}.`;
}

export function buildPlannerPrompt(req: GenerateItineraryRequest): string {
  const budget = deriveDailyBudget(
    req.preferences.pace,
    req.preferences.energyProfile
  );

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

  const areaStrict =
    req.area.kind === "polygon"
      ? `Vincolo geografico OBBLIGATORIO: l’utente ha disegnato un poligono su mappa. ${describeAreaBounds(req.area)} Tutte le tappe devono essere luoghi reali situati **dentro** questa area (o molto vicini al bordo, stesso paese/regione). Non proporre mai città o attrazioni in altre nazioni o regioni lontane (es. se l’area è in Scozia, niente Inghilterra o Irlanda). Ogni searchQuery deve includere nome del luogo + zona amministrativa corretta (es. "Isle of Skye Highlands Scotland UK") così la ricerca Maps resta nella zona.`
      : req.area.kind === "radius"
        ? `Area: ${describeArea(req.area)} ${describeAreaBounds(req.area)} Tutte le tappe devono essere entro il cerchio indicato.`
        : `Zona: ${describeArea(req.area)}`;

  const startEnd =
    req.endPlaceQuery && req.endPlaceQuery.trim().length > 0
      ? `- Partenza obbligatoria (primo luogo del viaggio): "${req.startPlaceQuery}". La **prima tappa del giorno 1** (orderInDay più basso) deve corrispondere a questo luogo o alle sue immediate vicinanze; imposta title e searchQuery coerenti (stesso comune/zona).\n- Ultima tappa desiderata: "${req.endPlaceQuery.trim()}". L’**ultima tappa dell’ultimo giorno** (ultimo orderInDay dell’ultimo dayIndex) deve corrispondere a questo luogo o alle sue immediate vicinanze.`
      : `- Partenza obbligatoria (primo luogo del viaggio): "${req.startPlaceQuery}". La **prima tappa del giorno 1** (orderInDay più basso) deve corrispondere a questo luogo o alle sue immediate vicinanze; imposta title e searchQuery coerenti (stesso comune/zona).`;

  const hubLoop =
    req.returnToHubEachNight === true
      ? `\n- **Base giornaliera (OBBLIGATORIO):** l’utente rientra ogni sera alla stessa base. La base è il luogo di partenza "${req.startPlaceQuery}". Per **ogni** giorno (tutti i dayIndex): la **prima** tappa deve essere esplorazione/uscita dalla base (o comunque coerente con partenza da quella zona) e l’**ultima** tappa del giorno deve essere pernottamento o sosta in/quella base (stesso comune o stesso luogo: usa searchQuery che punta esplicitamente a "${req.startPlaceQuery}" o alloggio nelle immediate vicinanze). Il giorno successivo riparte da quella base. Non pianificare catene lineari lontano senza rientro serale.`
      : "";

  const hard = req.preferences.hardConstraints?.filter(Boolean) ?? [];
  const soft = req.preferences.softWishes?.filter(Boolean) ?? [];
  const hardBlock =
    hard.length > 0
      ? `\n- **Vincoli rigidi (non negoziabili):** ${hard.map((h) => `"${h}"`).join("; ")}. Rispettali in ogni tappa (allergie, divieti, accessibilità, ecc.).`
      : "";
  const softBlock =
    soft.length > 0
      ? `\n- **Desideri flessibili:** ${soft.map((h) => `"${h}"`).join("; ")}. Bilanciali con logistica e ritmo; se non compatibili, privilegia i vincoli rigidi.`
      : "";
  const scenicHint =
    req.preferScenicRoutes === true
      ? `\n- L’utente preferisce **strade panoramiche / secondarie** (meno autostrada). Proponi tratte e tappe coerenti con guidare per paesaggio.`
      : "";

  return `Sei Roamy, un planner di viaggi stradali. ${lang}

Vincoli utente:
- Temi preferiti (peso simile): ${themes}.
- Ritmo: ${req.preferences.pace}.
- Energia target: ${req.preferences.energyProfile}.
- Mezzo: ${req.transport}. ${transport}
- Tempo: ${time}
- ${areaStrict}
${startEnd}${hubLoop}${hardBlock}${softBlock}${scenicHint}
- Limiti soft di realismo umano: massimo ${budget.maxStops} tappe/giorno, circa ${budget.maxDriveMinutes} minuti guida/giorno, circa ${budget.maxTotalMinutes} minuti di carico totale (visite + guida).

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
          "notes": "opzionale",
          "aiRationale": "opzionale: una frase che spiega perché proponi questa tappa"
        }
      ]
    }
  ]
}

Regole:
- Copri tutti i giorni richiesti (dayIndex sequenziale da 1).
- Ogni stop deve avere searchQuery concretamente cercabile (luogo + zona).
- Non inventare coordinate; servono solo titoli e query.
- Rispetta i limiti soft di realismo umano indicati sopra.
- Includi pasti dove ha senso (type meal), pernottamento (sleep) se multi-giorno, parcheggio/camper_stop solo se coerenti col mezzo.
- Rispetta rigorosamente partenza e (se indicata) ultima tappa come sopra.
- Se usi aiRationale, tienilo breve (max ~200 caratteri) e concreto.`;
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
