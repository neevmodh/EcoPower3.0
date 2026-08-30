// Live weather from Open-Meteo (DATA.md §3.2) — free, no key, feeds the
// cloud/temperature terms in the PV yield model. Cached and refreshed on an
// interval rather than fetched per tick.

const AHMEDABAD_LAT = 23.03;
const AHMEDABAD_LON = 72.58;

export interface WeatherSnapshot {
  cloudCoverFraction: number; // 0-1
  ambientTempC: number;
  fetchedAt: Date;
}

export async function fetchAhmedabadWeather(): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${AHMEDABAD_LAT}&longitude=${AHMEDABAD_LON}&current=temperature_2m,cloud_cover`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  const body = (await res.json()) as {
    current: { temperature_2m: number; cloud_cover: number };
  };
  return {
    cloudCoverFraction: body.current.cloud_cover / 100,
    ambientTempC: body.current.temperature_2m,
    fetchedAt: new Date(),
  };
}
