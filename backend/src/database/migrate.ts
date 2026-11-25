import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from './connection.js';

export function runMigrations(database = openDatabase()) {
  const migrationDirectory = path.resolve(process.cwd(), 'src/database/migrations');
  const files = fs
    .readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const hasMigration = database.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
  const recordMigration = database.prepare('INSERT INTO schema_migrations(filename) VALUES (?)');

  const apply = database.transaction(() => {
    for (const file of files) {
      if (!hasMigration.get(file)) {
        const sql = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
        database.exec(sql);
        recordMigration.run(file);
      }
    }
  });

  apply();
  return files.length;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const database = openDatabase();
  const count = runMigrations(database);
  database.close();
  console.log(`Database migrations verified: ${count} migration file(s) available.`);
}
