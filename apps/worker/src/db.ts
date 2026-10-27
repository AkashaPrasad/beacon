import mongoose from 'mongoose';

export interface MongoConnectOptions {
  uri: string;
  dbName: string;
  serverSelectionTimeoutMS?: number;
  maxPoolSize?: number;
}

export async function connectMongo({
  uri,
  dbName,
  serverSelectionTimeoutMS = 10_000,
  maxPoolSize = 10,
}: MongoConnectOptions): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  // autoIndex off: API-owned collections keep the API's indexes; the worker builds only
  // its own via ensureWorkerIndexes().
  return mongoose.connect(uri, { dbName, serverSelectionTimeoutMS, maxPoolSize, autoIndex: false });
}

export function mongoStatus(): string {
  const states: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return states[mongoose.connection.readyState] ?? 'unknown';
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
