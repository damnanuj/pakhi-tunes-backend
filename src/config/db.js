import mongoose from "mongoose";
import User from "../models/User.js";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2 && cached.promise) {
    return await cached.promise;
  }
  if (cached.promise) {
    try {
      const conn = await cached.promise;
      if (mongoose.connection.readyState === 1) return conn;
    } catch (e) {
      cached.promise = null;
    }
  }
  if (cached.conn && mongoose.connection.readyState === 0) cached.conn = null;

  const uri = process.env.MONGODB_URI;

  cached.promise = mongoose
    .connect(uri, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    })
    .then((m) => m.connection);

  const conn = await cached.promise;
  console.log("MongoDB connected");
  try {
    await User.repairGoogleUidIndex();
  } catch (error) {
    console.error("[db] Failed to repair googleUid index", error?.message ?? error);
  }
  return conn;
};
