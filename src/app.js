import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';
import favoritesRoutes from './routes/favoritesRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import artistRoutes from './routes/artistRoutes.js';
import songRoutes from './routes/songRoutes.js';
import newReleasesRoutes from './routes/newReleasesRoutes.js';
import albumRoutes from './routes/albumRoutes.js';
import genreRoutes from './routes/genreRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import appConfigRoutes from './routes/appConfigRoutes.js';
import appReleaseRoutes from './routes/appReleaseRoutes.js';
import appRoutes from './routes/appRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import presenceRoutes from './routes/presenceRoutes.js';
import listeningRoutes from './routes/listeningRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import playlistRoutes from './routes/playlistRoutes.js';
import catalogPlaylistRoutes from './routes/catalogPlaylistRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { limiters, routeLimits } from './middlewares/rateLimit.js';

const app = express();

// Behind Vercel / a reverse proxy, req.ip must be the client, not the proxy.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global per-IP ceiling for every route (see middlewares/rateLimit.js).
app.use(limiters.global);

// Per-group limiters, mounted before the routers they protect.
for (const [prefix, chain] of routeLimits) {
  app.use(prefix, ...chain);
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/favorites', favoritesRoutes);
app.use('/history', historyRoutes);
app.use('/playlists', playlistRoutes);
app.use('/catalog-playlists', catalogPlaylistRoutes);
app.use('/users', userRoutes);
app.use('/top-artists', artistRoutes);
app.use('/songs', songRoutes);
app.use('/new-releases', newReleasesRoutes);
app.use('/albums', albumRoutes);
app.use('/genres', genreRoutes);
app.use('/sessions', sessionRoutes);
app.use('/app-config', appConfigRoutes);
app.use('/app-releases', appReleaseRoutes);
app.use('/apps', appRoutes);
app.use('/guests', guestRoutes);
app.use('/presence', presenceRoutes);
app.use('/listening', listeningRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/devices', deviceRoutes);
app.use('/notifications', notificationRoutes);

app.use(errorHandler);

export default app;
