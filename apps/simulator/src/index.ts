// apps/simulator — models N meters with a physical model (#12). Publishes
// DLMS-shaped, OBIS-keyed, HMAC-signed readings over MQTT to the broker
// #14 stood up. #15's ingest worker is the consumer of this stream.

import mqtt from "mqtt";
import { loadFleet } from "./fleet.js";
import { fetchAhmedabadWeather, type WeatherSnapshot } from "./weather.js";
import { initMeterState, tick, type MeterRunningState } from "./meter-tick.js";
import { signReading } from "./publisher.js";

const MQTT_HOST = process.env.MQTT_HOST ?? "metro.proxy.rlwy.net";
const MQTT_PORT = Number(process.env.MQTT_PORT ?? "45248");
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? "10000"); // wall-clock cadence
const TICK_HOURS = Number(process.env.TICK_HOURS ?? "0.5"); // simulated register advance per tick
const WEATHER_REFRESH_MS = 15 * 60_000;

async function main() {
  const fleet = loadFleet();
  const states = new Map<string, MeterRunningState>(fleet.map((m) => [m.serial, initMeterState(m)]));

  let weather: WeatherSnapshot;
  try {
    weather = await fetchAhmedabadWeather();
    console.log(`[weather] cloud=${(weather.cloudCoverFraction * 100).toFixed(0)}% temp=${weather.ambientTempC}°C`);
  } catch (err) {
    console.warn("[weather] fetch failed, falling back to a clear-sky assumption:", err);
    weather = { cloudCoverFraction: 0.2, ambientTempC: 30, fetchedAt: new Date() };
  }
  setInterval(async () => {
    try {
      weather = await fetchAhmedabadWeather();
      console.log(`[weather] refreshed: cloud=${(weather.cloudCoverFraction * 100).toFixed(0)}% temp=${weather.ambientTempC}°C`);
    } catch (err) {
      console.warn("[weather] refresh failed, keeping last known snapshot:", err);
    }
  }, WEATHER_REFRESH_MS);

  const clients = new Map<string, mqtt.MqttClient>();
  for (const meter of fleet) {
    const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
      username: meter.serial,
      password: meter.mqttPassword,
      clientId: `sim-${meter.serial}-${Math.random().toString(16).slice(2)}`,
    });
    client.on("connect", () => console.log(`[mqtt] ${meter.serial} connected`));
    client.on("error", (err) => console.error(`[mqtt] ${meter.serial} error:`, err.message));
    clients.set(meter.serial, client);
  }

  setInterval(() => {
    const now = new Date();
    for (const meter of fleet) {
      const state = states.get(meter.serial)!;
      const result = tick(meter, state, {
        now,
        cloudCoverFraction: weather.cloudCoverFraction,
        ambientTempC: weather.ambientTempC,
        tickHours: TICK_HOURS,
      });
      states.set(meter.serial, result.state);

      const signed = signReading(result.reading, meter.hmacSecret);
      const topic = `ecopower/v1/${meter.serial}/readings`;
      const client = clients.get(meter.serial)!;
      client.publish(topic, JSON.stringify(signed), { qos: 0 }, (err) => {
        if (err) console.error(`[mqtt] ${meter.serial} publish failed:`, err.message);
      });

      console.log(
        `[tick] ${meter.serial} load=${result.loadKw.toFixed(2)}kW pv=${result.pvKw.toFixed(2)}kW ` +
          `net=${result.netKw >= 0 ? "import" : "export"} ${Math.abs(result.netKw).toFixed(2)}kW ` +
          `import=${result.state.cumulativeImportKwh.toFixed(3)}kWh export=${result.state.cumulativeExportKwh.toFixed(3)}kWh`,
      );
    }
  }, TICK_INTERVAL_MS);
}

main().catch((err) => {
  console.error("simulator crashed:", err);
  process.exit(1);
});
