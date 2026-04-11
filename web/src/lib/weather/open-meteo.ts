export type DailyWeather = {
  date: string;
  maxTempC: number;
  minTempC: number;
  weatherCode: number;
  summary: string;
};

const CODE_LABEL: Record<number, string> = {
  0: "Sereno",
  1: "Prevalentemente sereno",
  2: "Parzialmente nuvoloso",
  3: "Nuvoloso",
  45: "Nebbia",
  48: "Nebbia",
  51: "Pioggerella",
  61: "Pioggia",
  71: "Neve",
  80: "Rovesci",
  95: "Temporale",
};

function label(code: number): string {
  return CODE_LABEL[code] ?? "Variabile";
}

export async function fetchForecastForRange(
  lat: number,
  lng: number,
  startIsoDate: string,
  endIsoDate: string
): Promise<DailyWeather[]> {
  const start = new Date(startIsoDate);
  const end = new Date(endIsoDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", startIsoDate.slice(0, 10));
  url.searchParams.set("end_date", endIsoDate.slice(0, 10));

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
  };
  const d = data.daily;
  if (!d?.time?.length) return [];

  return d.time.map((date, i) => ({
    date,
    maxTempC: d.temperature_2m_max[i],
    minTempC: d.temperature_2m_min[i],
    weatherCode: d.weather_code[i],
    summary: label(d.weather_code[i]),
  }));
}
