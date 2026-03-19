import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 8000;

if (process.env.NODE_ENV !== 'production') {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to connect to MongoDB:', error);
    });
}

export default app;
