import * as Joi from 'joi';
export const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().required(),

  // JWT — minimum 32 chars enforced to prevent weak secrets
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // MinIO
  MINIO_ENDPOINT: Joi.string().required(),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET_DOCUMENTS: Joi.string().default('documents'),
  MINIO_BUCKET_PHOTOS: Joi.string().default('photos'),
  MINIO_BUCKET_PDFS: Joi.string().default('pdfs'),
  MINIO_BUCKET_REPORTS: Joi.string().default('pdfs'), // alias kept for compatibility

  // SMTP
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().default('gmao@localhost'),

  // Throttling
  THROTTLE_TTL: Joi.number().default(60_000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // App base URL (used in email links)
  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  // CORS (required only in production)
  CORS_ORIGIN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});
