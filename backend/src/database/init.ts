import { openDatabase } from './connection.js';
import { runMigrations } from './migrate.js';
import { seedDevelopmentVehicles } from './seed.js';

const database = openDatabase();
try {
  runMigrations(database);
  const vehicleCount = seedDevelopmentVehicles(database);
  console.log(`SQLite initialized with ${vehicleCount} development sample vehicles.`);
} finally {
  database.close();
}
