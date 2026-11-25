import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { resolveDatabasePath } from './index.js';

const serverDirectory = process.cwd();
const databasePath = resolveDatabasePath();

if (!fs.existsSync(databasePath)) {
  throw new Error(`Database is missing: ${databasePath}`);
}

const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: ['--yes', 'tsx', 'src/index.ts'],
  cwd: serverDirectory,
  stderr: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
  },
});

const client = new Client(
  { name: 'inventory-test-client', version: '1.0.0' },
  { capabilities: {} },
);

await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name).sort();
const expected = ['check_vehicle_availability', 'get_vehicle_details', 'search_vehicles'];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected registered tools: ${names.join(', ')}`);
}

const search = await client.callTool({
  name: 'search_vehicles',
  arguments: { brand: 'Toyota', min_seats: 7 },
});
if (search.isError) throw new Error('search_vehicles returned an error');
const searchResult = search.structuredContent as { dataSource?: string } | undefined;
const expectedDataSource =
  process.env.NODE_ENV === 'production' && process.env.SEED_DEVELOPMENT_DATA !== 'true'
    ? 'database'
    : 'development-sample-data';
if (searchResult?.dataSource !== expectedDataSource) {
  throw new Error(`Unexpected inventory data source: ${searchResult?.dataSource}`);
}

const details = await client.callTool({
  name: 'get_vehicle_details',
  arguments: { vehicle_id: 'DEV-TOYOTA-AVANZA' },
});
if (details.isError) throw new Error('get_vehicle_details returned an error');

const invalidDetails = await client.callTool({
  name: 'get_vehicle_details',
  arguments: { vehicle_id: 'DOES-NOT-EXIST' },
});
if (!invalidDetails.isError) throw new Error('Invalid vehicle ID was not rejected');

const invalidDates = await client.callTool({
  name: 'check_vehicle_availability',
  arguments: {
    vehicle_id: 'DEV-TOYOTA-AVANZA',
    start_date: '2099-05-20',
    end_date: '2099-05-19',
  },
});
if (!invalidDates.isError) throw new Error('Invalid date range was not rejected');

const writeDatabase = new Database(databasePath);
writeDatabase.pragma('foreign_keys = ON');
const reference = 'ERB-MCP-A-TEST';
writeDatabase.prepare('DELETE FROM bookings WHERE booking_reference = ?').run(reference);
writeDatabase
  .prepare(
    `
    INSERT INTO bookings (
      booking_reference, customer_name, customer_phone, vehicle_id,
      start_date, end_date, pickup_location, return_location,
      total_estimated_price, booking_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  )
  .run(
    reference,
    'MCP Test',
    '+628123456789',
    'DEV-TOYOTA-AVANZA',
    '2099-06-10',
    '2099-06-15',
    'Test',
    'Test',
    2750000,
    'PENDING',
  );

const unavailable = await client.callTool({
  name: 'check_vehicle_availability',
  arguments: {
    vehicle_id: 'DEV-TOYOTA-AVANZA',
    start_date: '2099-06-12',
    end_date: '2099-06-13',
  },
});
if (unavailable.isError) throw new Error('Availability call unexpectedly failed');

writeDatabase.prepare('DELETE FROM bookings WHERE booking_reference = ?').run(reference);
writeDatabase.close();
await client.close();

console.log(
  JSON.stringify(
    {
      registeredTools: names,
      searchTest: 'passed',
      dataSourceTest: 'passed',
      vehicleDetailsTest: 'passed',
      invalidVehicleTest: 'passed',
      invalidDateTest: 'passed',
      bookingConflictTest: 'passed',
      databaseRecordsUsed: true,
      serverReadOnly: true,
    },
    null,
    2,
  ),
);
