import mongoose from 'mongoose';

export interface MongoConnectOptions {
  uri: string;
  dbName: string;
  serverSelectionTimeoutMS?: number;
  maxPoolSize?: number;
}

/** Connect the shared Mongoose instance. Reads nothing from the environment itself. */
export async function connectMongo({
  uri,
  dbName,
  serverSelectionTimeoutMS = 10_000,
  maxPoolSize = 10,
}: MongoConnectOptions): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri, { dbName, serverSelectionTimeoutMS, maxPoolSize });
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
