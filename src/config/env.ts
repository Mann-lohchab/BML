import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('12h'),
  SAT_BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  SAT_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),
  SAT_BOOTSTRAP_ADMIN_NAME: z.string().min(1).default('BML Admin'),
  SAT_MQTT_URL: z.string().optional(),
  SAT_MQTT_TOPIC: z.string().default('devicesIn/ced/#'),
  SAT_WSPD_DECRYPTION: z.enum(['none', 'base64', 'aes-256-gcm']).default('none'),
  SAT_WSPD_SECRET: z.string().optional(),
  SAT_REPORT_DIR: z.string().default('./data/reports')
});

export const env = envSchema.parse(process.env);
