import mqtt from 'mqtt';
import { env } from '../config/env';
import { ingestTelemetry } from '../services/telemetry-service';

async function main() {
  if (!env.SAT_MQTT_URL) {
    // eslint-disable-next-line no-console
    console.log('MQTT disabled: SAT_MQTT_URL not set');
    return;
  }

  const client = mqtt.connect(env.SAT_MQTT_URL, {
    reconnectPeriod: 5_000
  });

  client.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log(`Connected to MQTT ${env.SAT_MQTT_URL}`);
    client.subscribe(env.SAT_MQTT_TOPIC);
  });

  client.on('message', async (topic, payload) => {
    try {
      const result = await ingestTelemetry(topic, payload);
      // eslint-disable-next-line no-console
      console.log(`ingested packet ${result.rawPacketId} duplicated=${result.duplicated}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('ingestion error', error);
    }
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
