"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ItineraryResult } from "@/lib/itinerary/schema";
import { dayItineraryHex } from "@/lib/itinerary/colors";
import {
  itineraryAnalytics,
  reconcileItineraryLegs,
} from "@/lib/itinerary/legs-reconcile";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#2a1810",
    backgroundColor: "#FFF9F5",
  },
  coverTitle: {
    fontSize: 36,
    marginBottom: 8,
    color: "#B3123F",
    fontFamily: "Helvetica-Bold",
  },
  coverSub: { fontSize: 12, color: "#5c534f", marginBottom: 24 },
  h2: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 8,
    color: "#4A0B1F",
  },
  map: { width: "100%", height: 200, objectFit: "cover", marginBottom: 12 },
  dayBlock: { marginBottom: 12 },
  dayTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e8ddd6",
    paddingVertical: 6,
 },
  colN: { width: "6%", fontSize: 9, color: "#888" },
  colMain: { width: "54%", paddingRight: 8 },
  colAddr: { width: "40%", fontSize: 8, color: "#666" },
  recap: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#FAD0DA33",
    borderRadius: 4,
  },
  recapLine: { marginBottom: 4, fontSize: 10 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#888",
    textAlign: "center",
  },
});

function sortGlobalStops(days: ItineraryResult["days"]) {
  const flat = days.flatMap((d) => d.stops);
  return [...flat].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.orderInDay - b.orderInDay;
  });
}

async function postStaticMap(
  body: Record<string, unknown>
): Promise<string | null> {
  try {
    const res = await fetch("/api/maps/static-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { url?: string };
    return j.url ?? null;
  } catch {
    return null;
  }
}

/** Evita problemi CORS incorporando l’immagine come data URL. */
async function imageUrlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadItineraryPdf(result: ItineraryResult) {
  const r = reconcileItineraryLegs(result);
  const analytics = itineraryAnalytics(r);
  const global = sortGlobalStops(r.days);
  const withCoords = global
    .map((s, i) => ({ s, i }))
    .filter(
      (x) =>
        x.s.lat != null &&
        x.s.lng != null &&
        Number.isFinite(x.s.lat) &&
        Number.isFinite(x.s.lng)
    );

  const stopsPayload = withCoords.map(({ s }, idx) => ({
    lat: s.lat!,
    lng: s.lng!,
    label: String(idx + 1),
  }));

  let overviewDataUri: string | null = null;
  let detailDataUri: string | null = null;
  if (stopsPayload.length > 0) {
    const overviewUrl = await postStaticMap({
      mode: "overview",
      stops: stopsPayload,
    });
    const day1IndicesInPayload = withCoords
      .map((x, idx) => (x.s.dayIndex === 1 ? idx : -1))
      .filter((idx) => idx >= 0);
    const hi =
      day1IndicesInPayload.length > 0
        ? day1IndicesInPayload
        : withCoords
            .slice(0, Math.min(8, withCoords.length))
            .map((_, idx) => idx);
    const detailUrl = await postStaticMap({
      mode: "detail",
      stops: stopsPayload,
      highlightIndices: hi,
    });
    if (overviewUrl) overviewDataUri = await imageUrlToDataUri(overviewUrl);
    if (detailUrl && detailUrl !== overviewUrl) {
      detailDataUri = await imageUrlToDataUri(detailUrl);
    }
  }

  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>Roamy</Text>
        <Text style={styles.coverSub}>Itinerario · {r.summary.slice(0, 200)}</Text>
        {overviewDataUri ? (
          <Image
            style={styles.map}
            src={{ uri: overviewDataUri }}
            alt="Mappa panoramica itinerario"
          />
        ) : null}
        {detailDataUri ? (
          <Image
            style={styles.map}
            src={{ uri: detailDataUri }}
            alt="Dettaglio tratto itinerario"
          />
        ) : null}

        <Text style={styles.h2}>Riepilogo</Text>
        <View style={styles.recap}>
          <Text style={styles.recapLine}>
            Distanza stimata: {analytics.totalKm} km
          </Text>
          <Text style={styles.recapLine}>
            Tempo di guida stimato: {analytics.totalHoursDrive} h
            {analytics.hasPartialTimes ? " (parziale)" : ""}
          </Text>
          <Text style={styles.recapLine}>
            {analytics.dayCount} giorni · {analytics.stopCount} tappe ·{" "}
            {analytics.legsAirOnly} tratti in linea d&apos;aria
          </Text>
        </View>

        {[...r.days]
          .sort((a, b) => a.dayIndex - b.dayIndex)
          .map((day) => (
            <View key={day.dayIndex} style={styles.dayBlock} wrap={false}>
              <Text
                style={{
                  ...styles.dayTitle,
                  color: dayItineraryHex(day.dayIndex),
                }}
              >
                Giorno {day.dayIndex}
                {day.label ? ` · ${day.label}` : ""}
              </Text>
              {[...day.stops]
                .sort((a, b) => a.orderInDay - b.orderInDay)
                .map((s, idx) => (
                  <View key={`${s.orderInDay}-${idx}`} style={styles.row}>
                    <Text style={styles.colN}>{idx + 1}</Text>
                    <View style={styles.colMain}>
                      <Text style={{ fontFamily: "Helvetica-Bold" }}>
                        {s.title}
                      </Text>
                      <Text style={{ fontSize: 8, color: "#888" }}>
                        {s.type}
                      </Text>
                    </View>
                    <Text style={styles.colAddr}>
                      {s.formattedAddress ?? "—"}
                    </Text>
                  </View>
                ))}
            </View>
          ))}

        <Text
          style={styles.footer}
          fixed
        >
          Generato con Roamy · Verifica sempre orari e viabilità prima di partire.
        </Text>
      </Page>
    </Document>
  );

  const blob = await pdf(Doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `roamy-itinerario-${r.id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
