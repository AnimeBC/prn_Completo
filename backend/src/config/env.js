import dotenv from 'dotenv';
dotenv.config();

function parseFrontendUrls() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const frontendUrls = parseFrontendUrls();

export const env = {
  port: Number(process.env.PORT || 3001),
  frontendUrl: frontendUrls[0] || 'http://localhost:3000',
  frontendUrls,
  jwtSecret: process.env.JWT_SECRET || 'pikantepe_dev_secret',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'pikantepe',
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  app: {
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT || 3001)}`,
  },
  mail: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
    from: process.env.MAIL_FROM || 'pikante pe <no-reply@pikantepe.com>',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },
};
