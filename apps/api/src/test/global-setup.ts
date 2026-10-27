import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let server: MongoMemoryServer | undefined;

/** One in-memory mongod for the whole run; each test file uses its own database. */
export async function setup(project: TestProject): Promise<void> {
  server = await MongoMemoryServer.create();
  project.provide('mongoUri', server.getUri());
}

export async function teardown(): Promise<void> {
  await server?.stop();
}
