import ActiveSession from '../models/ActiveSession.js';

let ioRef = null;

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
 * host disconnect). Broadcasting is keyed off the sessionId alone so a room that
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

/** Terminate whatever session a host currently owns, notifying its listeners. */
export async function terminateSessionsByHost(hostId, { source = 'unknown' } = {}) {
  if (!hostId) return [];

  const sessions = await ActiveSession.find({ hostId })
    .select({ _id: 1 })
    .lean();

  return Promise.all(
    sessions.map((session) => terminateSession(session._id, { source }))
  );
}
