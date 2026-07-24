import ActiveSession from '../models/ActiveSession.js';
import User from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';

function sessionRoom(sessionId) {
  return `session:${sessionId}`;
}

async function getSessionById(sessionId) {
  if (!sessionId) return null;
  return ActiveSession.findById(sessionId);
}

function mapListeners(listeners) {
  if (!Array.isArray(listeners)) return [];
  return listeners.map((listener) => ({
    userId: listener.userId?.toString?.() ?? String(listener.userId),
    name: listener.name ?? 'Listener',
    avatar: listener.avatar ?? null,
  }));
}

function emitListenersUpdate(io, sessionId, session) {
  const listeners = mapListeners(session.listeners);
  const listenerCount = listeners.length;
  io.to(sessionRoom(sessionId)).emit('session:listeners', {
    type: 'LISTENERS_UPDATED',
    listenerCount,
    listeners,
  });
  io.to(sessionRoom(sessionId)).emit('session:listenerCount', {
    type: 'LISTENERS_UPDATED',
    listenerCount,
  });
}

async function removeListenerFromSession(io, session, userId) {
  if (!session) return;
  const before = session.listeners?.length ?? 0;
  session.listeners = (session.listeners ?? []).filter(
    (listener) => listener.userId.toString() !== userId
  );
  session.listenerCount = session.listeners.length;
  if (session.listeners.length !== before || session.listenerCount !== before) {
    await session.save();
    emitListenersUpdate(io, session._id.toString(), session);
  }
}

async function endSession(io, sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) return;

  io.to(sessionRoom(sessionId)).emit('session:ended', {
    type: 'SESSION_ENDED',
    sessionId: session._id.toString(),
  });
  await session.deleteOne();
}

export function registerSessionSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const decoded = verifyToken(token);
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
      };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.data.role = null;
    socket.data.sessionId = null;

    socket.on('host:start', async (payload, ack) => {
      try {
        const sessionId = payload?.sessionId;
        const session = await getSessionById(sessionId);
        if (!session || session.hostId.toString() !== userId) {
          ack?.({ ok: false, error: 'Session not found' });
          return;
        }

        socket.data.role = 'host';
        socket.data.sessionId = sessionId;
        socket.join(sessionRoom(sessionId));
        ack?.({
          ok: true,
          sessionId,
          listeners: mapListeners(session.listeners),
          listenerCount: session.listeners?.length ?? 0,
        });
      } catch (error) {
        ack?.({ ok: false, error: error?.message ?? 'Failed to start host' });
      }
    });

    socket.on('host:play', async (payload) => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'host' || !sessionId) return;
      const session = await getSessionById(sessionId);
      if (!session) return;
      session.playing = true;
      await session.save();
      socket.to(sessionRoom(sessionId)).emit('session:play', {
        type: 'PLAY',
        positionMs: payload?.positionMs ?? session.positionMs,
        sentAt: Date.now(),
        repeatMode: payload?.repeatMode,
      });
    });

    socket.on('host:pause', async (payload) => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'host' || !sessionId) return;
      const session = await getSessionById(sessionId);
      if (!session) return;
      session.playing = false;
      if (payload?.positionMs !== undefined) {
        session.positionMs = Math.max(0, Number(payload.positionMs) || 0);
      }
      await session.save();
      socket.to(sessionRoom(sessionId)).emit('session:pause', {
        type: 'PAUSE',
        positionMs: session.positionMs,
        sentAt: Date.now(),
        repeatMode: payload?.repeatMode,
      });
    });

    socket.on('host:seek', async (payload) => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'host' || !sessionId) return;
      const positionMs = Math.max(0, Number(payload?.positionMs) || 0);
      const session = await getSessionById(sessionId);
      if (!session) return;
      session.positionMs = positionMs;
      await session.save();
      socket.to(sessionRoom(sessionId)).emit('session:seek', {
        type: 'SEEK',
        positionMs,
        sentAt: Date.now(),
        repeatMode: payload?.repeatMode,
      });
    });

    socket.on('host:trackChange', async (payload) => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'host' || !sessionId) return;
      const session = await getSessionById(sessionId);
      if (!session) return;

      const clearing = !payload?.trackId;
      if (clearing) {
        session.trackId = '';
        session.trackTitle = '';
        session.trackArtist = '';
        session.trackArtwork = '';
        session.trackUri = '';
        session.trackDuration = 0;
        session.positionMs = 0;
        session.playing = false;
      } else {
        if (payload?.trackId) session.trackId = payload.trackId;
        if (payload?.trackTitle !== undefined) session.trackTitle = payload.trackTitle;
        if (payload?.trackArtist !== undefined) session.trackArtist = payload.trackArtist;
        if (payload?.trackArtwork !== undefined) session.trackArtwork = payload.trackArtwork;
        if (payload?.trackUri !== undefined) session.trackUri = payload.trackUri;
        if (payload?.trackDuration !== undefined) {
          session.trackDuration = Number(payload.trackDuration) || 0;
        }
        session.positionMs = Math.max(0, Number(payload?.positionMs) || 0);
        session.playing = payload?.playing !== false;
      }
      await session.save();

      socket.to(sessionRoom(sessionId)).emit('session:trackChange', {
        type: 'TRACK_CHANGE',
        trackId: session.trackId,
        trackTitle: session.trackTitle,
        trackArtist: session.trackArtist,
        trackArtwork: session.trackArtwork,
        trackUri: session.trackUri,
        trackDuration: session.trackDuration,
        positionMs: session.positionMs,
        playing: session.playing,
        sentAt: Date.now(),
        repeatMode: payload?.repeatMode,
      });
    });

    socket.on('host:heartbeat', async (payload) => {
      try {
        const sessionId = socket.data.sessionId;
        if (socket.data.role !== 'host' || !sessionId) return;
        const session = await getSessionById(sessionId);
        if (!session) return;

        const positionMs = Math.max(0, Number(payload?.positionMs) || 0);
        session.positionMs = positionMs;
        if (payload?.playing !== undefined) session.playing = Boolean(payload.playing);
        if (payload?.trackId) session.trackId = payload.trackId;
        if (
          payload?.latitude !== undefined &&
          payload?.longitude !== undefined &&
          Number.isFinite(Number(payload.latitude)) &&
          Number.isFinite(Number(payload.longitude))
        ) {
          session.location = {
            type: 'Point',
            coordinates: [Number(payload.longitude), Number(payload.latitude)],
          };
        } else if (session.visibility === 'private') {
          session.set('location', undefined);
        }
        await session.save();

        socket.to(sessionRoom(sessionId)).emit('session:heartbeat', {
          type: 'HEARTBEAT',
          positionMs,
          playing: session.playing,
          trackId: session.trackId,
          sentAt: Date.now(),
          repeatMode: payload?.repeatMode,
        });
      } catch (error) {
        console.error('[session] host:heartbeat failed:', error?.message ?? error);
      }
    });

    socket.on('host:stop', async () => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'host' || !sessionId) return;
      await endSession(io, sessionId);
      socket.data.role = null;
      socket.data.sessionId = null;
    });

    socket.on('listener:join', async (payload, ack) => {
      try {
        const sessionId = payload?.sessionId;
        const session = await getSessionById(sessionId);
        if (!session) {
          ack?.({ ok: false, error: 'Session not found' });
          return;
        }
        if (session.hostId.toString() === userId) {
          ack?.({ ok: false, error: 'Host cannot join own session as listener' });
          return;
        }

        const user = await User.findById(userId).select('name avatar');
        const member = {
          userId,
          name: user?.name ?? socket.user.name ?? 'Listener',
          avatar: user?.avatar ?? null,
        };

        const existingListeners = session.listeners ?? [];
        const withoutSelf = existingListeners.filter(
          (listener) => listener.userId.toString() !== userId
        );
        session.listeners = [...withoutSelf, member];
        session.listenerCount = session.listeners.length;

        socket.data.role = 'listener';
        socket.data.sessionId = sessionId;
        socket.join(sessionRoom(sessionId));

        await session.save();

        const snapshot = session.toPublicObject();
        ack?.({ ok: true, session: snapshot });

        emitListenersUpdate(io, sessionId, session);
      } catch (error) {
        ack?.({ ok: false, error: error?.message ?? 'Failed to join session' });
      }
    });

    socket.on('listener:leave', async () => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== 'listener' || !sessionId) return;

      const session = await getSessionById(sessionId);
      await removeListenerFromSession(io, session, userId);

      socket.leave(sessionRoom(sessionId));
      socket.data.role = null;
      socket.data.sessionId = null;
    });

    socket.on('disconnect', async () => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      if (socket.data.role === 'host') {
        await endSession(io, sessionId);
        return;
      }

      if (socket.data.role === 'listener') {
        const session = await getSessionById(sessionId);
        await removeListenerFromSession(io, session, userId);
      }
    });
  });
}

export { endSession };
