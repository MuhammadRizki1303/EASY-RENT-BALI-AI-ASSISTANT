import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function resolveDatabasePath(databaseUrl = process.env.DATABASE_URL): string {
  if (!databaseUrl) {
    return path.resolve(process.cwd(), 'data/easy-rent-bali.db');
  }

  if (!databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must use the file: scheme');
  }

  const relativePath = databaseUrl.slice('file:'.length);
  return path.resolve(process.cwd(), relativePath);
}

export function openDatabase(databaseUrl = process.env.DATABASE_URL): Database.Database {
  const databasePath = resolveDatabasePath(databaseUrl);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  return database;
}
