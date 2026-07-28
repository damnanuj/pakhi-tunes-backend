import ActiveSession from '../models/ActiveSession.js';

let ioRef = null;
let hostTimeoutSweeperHandle = null;

/** Host may drop briefly (background, reconnect) without ending the room. */
export const HOST_DISCONNECT_GRACE_MS = 90_000;
const HOST_TIMEOUT_SWEEP_INTERVAL_MS = 25_000;

export function setSessionIo(io) {
  ioRef = io;
}

export function getSessionIo() {
  return ioRef;
}

export function sessionRoom(sessionId) {
  return `session:${sessionId}`;
}

function roomSize(io, room) {
  try {
    return io?.sockets?.adapter?.rooms?.get(room)?.size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * End a session for everyone: broadcast first, then delete.
 *
 * Safe to call more than once and from any path (socket host:stop, REST delete,
 * host timeout). Broadcasting is keyed off the sessionId alone so a room that
 * was already deleted by a competing path still notifies its listeners.
 */
export async function terminateSession(sessionId, { source = 'unknown' } = {}) {
  const id = sessionId ? String(sessionId) : '';
  if (!id) return { ok: false, sessionId: null, deleted: false, notified: 0 };

  const io = ioRef;
  const room = sessionRoom(id);
  const notified = roomSize(io, room);

  if (io) {
    io.to(room).emit('session:ended', {
      type: 'SESSION_ENDED',
      sessionId: id,
    });
  }

  let deleted = false;
  try {
    const result = await ActiveSession.deleteOne({ _id: id });
    deleted = (result?.deletedCount ?? 0) > 0;
  } catch (error) {
    console.error(
      `[session] terminate delete failed (source=${source}, sessionId=${id}):`,
      error?.message ?? error
    );
  }

  if (io) {
    try {
      io.socketsLeave(room);
    } catch {
      /* adapter may already have dropped the room */
    }
  }

  console.log(
    `[session] terminated sessionId=${id} source=${source} deleted=${deleted} notified=${notified}`
  );

  return { ok: true, sessionId: id, deleted, notified };
}

/**
 * Terminate sessions owned by a host.
 * Pass `visibility` to scope (e.g. 'nearby' when discoverable is turned off,
 * so private rooms stay alive).
 */
export async function terminateSessionsByHost(
  hostId,
  { source = 'unknown', visibility } = {}
) {
  if (!hostId) return [];

  const filter = { hostId };
  if (visibility === 'nearby' || visibility === 'private') {
    filter.visibility = visibility;
  }

  const sessions = await ActiveSession.find(filter).select({ _id: 1 }).lean();

  return Promise.all(
    sessions.map((session) => terminateSession(session._id, { source }))
  );
}

/**
 * Soft-mark host as disconnected without ending the room.
 * Listeners get session:hostConnection so they can show "reconnecting".
 * The sweeper ends the room if hostLastSeenAt stays stale past the grace window.
 */
export async function markHostDisconnected(sessionId, { excludingSocketId } = {}) {
  const id = sessionId ? String(sessionId) : '';
  if (!id) return { ok: false };

  const io = ioRef;
  if (io && excludingSocketId) {
    try {
      const sockets = await io.in(sessionRoom(id)).fetchSockets();
      const otherHostStillConnected = sockets.some(
        (s) =>
          s.id !== excludingSocketId &&
          s.data?.role === 'host' &&
          String(s.data?.sessionId) === id
      );
      if (otherHostStillConnected) {
        return { ok: true, skipped: true };
      }
    } catch (error) {
      console.error(
        '[session] markHostDisconnected socket check failed:',
        error?.message ?? error
      );
    }
  }

  const now = new Date();
  try {
    await ActiveSession.updateOne(
      { _id: id },
      {
        $set: {
          hostConnected: false,
          hostLastSeenAt: now,
        },
      }
    );
  } catch (error) {
    console.error(
      `[session] markHostDisconnected update failed sessionId=${id}:`,
      error?.message ?? error
    );
    return { ok: false };
  }

  if (io) {
    io.to(sessionRoom(id)).emit('session:hostConnection', {
      type: 'HOST_CONNECTION',
      connected: false,
      sessionId: id,
      sentAt: Date.now(),
    });
  }

  return { ok: true, skipped: false };
}

export function emitHostConnection(sessionId, connected) {
  const id = sessionId ? String(sessionId) : '';
  const io = ioRef;
  if (!id || !io) return;
  io.to(sessionRoom(id)).emit('session:hostConnection', {
    type: 'HOST_CONNECTION',
    connected: Boolean(connected),
    sessionId: id,
    sentAt: Date.now(),
  });
}

/**
 * End rooms whose host has not been seen within the grace window.
 * Topology-agnostic: driven by MongoDB hostLastSeenAt (works multi-instance).
 */
export async function sweepStaleHostSessions() {
  const cutoff = new Date(Date.now() - HOST_DISCONNECT_GRACE_MS);
  let stale = [];
  try {
    stale = await ActiveSession.find({
      hostLastSeenAt: { $lt: cutoff },
    })
      .select({ _id: 1 })
      .lean();
  } catch (error) {
    console.error(
      '[session] sweepStaleHostSessions query failed:',
      error?.message ?? error
    );
    return { checked: 0, terminated: 0 };
  }

  if (stale.length === 0) {
    return { checked: 0, terminated: 0 };
  }

  const results = await Promise.all(
    stale.map((session) =>
      terminateSession(session._id, { source: 'host-timeout' })
    )
  );
  const terminated = results.filter((r) => r.deleted).length;
  if (terminated > 0) {
    console.log(
      `[session] host-timeout sweeper terminated=${terminated} of ${stale.length} stale`
    );
  }
  return { checked: stale.length, terminated };
}

/** Drop the legacy updatedAt TTL index if it still exists. */
export async function dropLegacySessionTtlIndex() {
  try {
    const indexes = await ActiveSession.collection.indexes();
    const legacy = indexes.find(
      (idx) =>
        idx.key?.updatedAt === 1 &&
        typeof idx.expireAfterSeconds === 'number' &&
        !idx.key?.expiresAt
    );
    if (legacy?.name) {
      await ActiveSession.collection.dropIndex(legacy.name);
      console.log(`[session] dropped legacy TTL index: ${legacy.name}`);
    }
  } catch (error) {
    // Index may not exist yet on fresh DBs.
    if (error?.codeName !== 'IndexNotFound') {
      console.error(
        '[session] dropLegacySessionTtlIndex failed:',
        error?.message ?? error
      );
    }
  }
}

export function startHostTimeoutSweeper() {
  if (hostTimeoutSweeperHandle) return;
  void dropLegacySessionTtlIndex();
  void sweepStaleHostSessions();
  hostTimeoutSweeperHandle = setInterval(() => {
    void sweepStaleHostSessions();
  }, HOST_TIMEOUT_SWEEP_INTERVAL_MS);
  // Allow the process to exit without waiting on the interval (Node/tests).
  if (typeof hostTimeoutSweeperHandle.unref === 'function') {
    hostTimeoutSweeperHandle.unref();
  }
  console.log(
    `[session] host-timeout sweeper started graceMs=${HOST_DISCONNECT_GRACE_MS} intervalMs=${HOST_TIMEOUT_SWEEP_INTERVAL_MS}`
  );
}

export function stopHostTimeoutSweeper() {
  if (!hostTimeoutSweeperHandle) return;
  clearInterval(hostTimeoutSweeperHandle);
  hostTimeoutSweeperHandle = null;
}
