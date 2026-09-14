import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { MEDIA_DIR } from './services/upload.js';

import authRoutes from './routes/auth.js';
import videosRoutes from './routes/videos.js';
import statsRoutes from './routes/stats.js';
import eventsRoutes from './routes/events.js';
import tagsRoutes from './routes/tags.js';
import feticheCategoriasRoutes from './routes/feticheCategorias.js';
import hentaiRoutes from './routes/hentai.js';
import packsRoutes from './routes/packs.js';
import communityRoutes from './routes/community.js';
import livesRoutes from './routes/lives.js';
import interactionsRoutes from './routes/interactions.js';
import translationsRoutes from './routes/translations.js';
import commentsRoutes from './routes/comments.js';
import channelsRoutes from './routes/channels.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.frontendUrl === '*' ? true : env.frontendUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// media (videos / portadas) — carpeta media_completa en la raíz del proyecto
app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d' }));

app.get('/', (req, res) => res.json({ ok: true, name: 'pikantepe-backend', api: '/api', health: '/api/health' }));
app.get('/api/health', (req, res) => res.json({ ok: true, env: env.nodeEnv, time: new Date().toISOString() }));
app.get('/api', (req, res) => res.json({
  name: 'pikantepe-backend',
  routes: ['/api/auth/login', '/api/auth/me', '/api/videos', '/api/videos/upload', '/api/stats', '/api/events', '/api/tags', '/api/fetiche-categorias'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/fetiche-categorias', feticheCategoriasRoutes);
app.use('/api/hentai', hentaiRoutes);
app.use('/api/packs', packsRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/lives', livesRoutes);
// interacciones (/api/videos/:id/like, /save, /view, /report, /download, /share, /api/channels/follow)
app.use('/api', interactionsRoutes);
// i18n DB (/api/languages, /api/i18n/:lang)
app.use('/api', translationsRoutes);
// comentarios (/api/videos/:id/comments)
app.use('/api', commentsRoutes);
// canales / perfiles públicos (/api/channels/:slug, /videos, /follow)
app.use('/api/channels', channelsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
