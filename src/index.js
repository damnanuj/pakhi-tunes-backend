import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import { registerSessionSocket } from './sockets/sessionSocket.js';

const PORT = process.env.PORT || 8000;

let httpServer = null;
let io = null;

export function getIo() {
  return io;
}

if (process.env.NODE_ENV !== 'production') {
  connectDB()
    .then(() => {
      httpServer = createServer(app);
      io = new Server(httpServer, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
      });
      registerSessionSocket(io);

      httpServer.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Socket.IO ready on ws://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to connect to MongoDB:', error);
    });
}

export default app;
