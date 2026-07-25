import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import app from './app.js';
import { connectDB } from './config/db.js';
import { registerSessionSocket } from './sockets/sessionSocket.js';
import { cleanupInactiveGuests } from './jobs/guestCleanup.js';
import { runPresenceMinuteJobs } from './jobs/presenceJobs.js';
import { runNotificationJobs } from './jobs/notificationJobs.js';

const PORT = process.env.PORT || 8000;

let httpServer = null;
let io = null;

export function getIo() {
  return io;
}

const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  connectDB()
    .then(() => {
      httpServer = createServer(app);
      io = new Server(httpServer, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
      });
      registerSessionSocket(io);

      httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Socket.IO ready on ws://localhost:${PORT}`);

        cron.schedule('0 2 * * *', async () => {
          try {
            const result = await cleanupInactiveGuests();
            console.log('[guestCleanup] Marked inactive guests:', result);
          } catch (error) {
            console.error('[guestCleanup] Failed:', error);
          }
        });

        cron.schedule('* * * * *', async () => {
          try {
            const result = await runPresenceMinuteJobs();
            if (result.stale.closed > 0) {
              console.log('[presence] Closed stale sessions:', result.stale);
            }
          } catch (error) {
            console.error('[presence] Minute jobs failed:', error);
          }
        });

        cron.schedule('* * * * *', async () => {
          try {
            const result = await runNotificationJobs();
            if (result.processed > 0) {
              console.log('[notifications] Processed scheduled:', result);
            }
          } catch (error) {
            console.error('[notifications] Scheduled job failed:', error);
          }
        });
      });
    })
    .catch((error) => {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    });
}

export default app;
