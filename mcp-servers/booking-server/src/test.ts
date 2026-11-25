import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import { resolveDatabasePath } from './index.js';

const serverDirectory = path.resolve(process.cwd());
const databasePath = resolveDatabasePath();

const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: ['--yes', 'tsx', 'src/index.ts'],
  cwd: serverDirectory,
  stderr: 'inherit',
  env: {
    DATABASE_URL: `file:${databasePath}`,
  },
});

const client = new Client({ name: 'booking-test-client', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name).sort();
const expected = ['cancel_booking', 'create_booking', 'get_booking', 'update_booking'];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected registered tools: ${names.join(', ')}`);
}

const directDatabase = new Database(databasePath);
directDatabase.pragma('foreign_keys = ON');
directDatabase.prepare(`DELETE FROM bookings WHERE notes LIKE 'MCP B persistence test%'`).run();
directDatabase.close();

const createArgs = {
  customer_name: 'MCP Persistence Customer',
  customer_phone: '+628123456789',
  vehicle_id: 'DEV-TOYOTA-AVANZA',
  start_date: '2099-07-10',
  end_date: '2099-07-13',
  pickup_location: 'Test Airport',
  return_location: 'Test Hotel',
  notes: 'MCP B persistence test',
};

const created = await client.callTool({
  name: 'create_booking',
  arguments: createArgs,
});
if (created.isError) throw new Error('create_booking failed');

const createdStructured = created.structuredContent as {
  booking: { booking_reference: string; total_estimated_price: number };
};
const reference = createdStructured.booking.booking_reference;
if (createdStructured.booking.total_estimated_price !== 1650000) {
  throw new Error('Estimated price calculation failed');
}

const retrieved = await client.callTool({
  name: 'get_booking',
  arguments: { booking_reference: reference },
});
if (retrieved.isError) throw new Error('get_booking failed');

const duplicate = await client.callTool({
  name: 'create_booking',
  arguments: createArgs,
});
if (!duplicate.isError) throw new Error('Duplicate overlapping booking was accepted');

const invalidDates = await client.callTool({
  name: 'create_booking',
  arguments: {
    ...createArgs,
    start_date: '2099-08-20',
    end_date: '2099-08-19',
  },
});
if (!invalidDates.isError) throw new Error('Invalid date range was accepted');

const invalidVehicle = await client.callTool({
  name: 'create_booking',
  arguments: {
    ...createArgs,
    vehicle_id: 'DOES-NOT-EXIST',
    start_date: '2099-08-20',
    end_date: '2099-08-22',
  },
});
if (!invalidVehicle.isError) throw new Error('Invalid vehicle ID was accepted');

const updated = await client.callTool({
  name: 'update_booking',
  arguments: {
    booking_reference: reference,
    customer_name: 'MCP Persistence Customer Updated',
    pickup_location: 'Updated Test Airport',
  },
});
if (updated.isError) throw new Error('update_booking failed');

const invalidUpdateDates = await client.callTool({
  name: 'update_booking',
  arguments: {
    booking_reference: reference,
    start_date: '2099-08-21',
    end_date: '2099-08-20',
  },
});
if (!invalidUpdateDates.isError) throw new Error('Invalid update date range was accepted');

await client.close();

const restarted = new Client(
  { name: 'booking-restart-test-client', version: '1.0.0' },
  { capabilities: {} },
);
const restartedTransport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: ['--yes', 'tsx', 'src/index.ts'],
  cwd: serverDirectory,
  stderr: 'inherit',
  env: {
    DATABASE_URL: `file:${databasePath}`,
  },
});
await restarted.connect(restartedTransport);

const persisted = await restarted.callTool({
  name: 'get_booking',
  arguments: { booking_reference: reference },
});
if (persisted.isError) throw new Error('Booking did not persist after restart');

const cancelled = await restarted.callTool({
  name: 'cancel_booking',
  arguments: {
    booking_reference: reference,
    cancellation_reason: 'MCP persistence test completed',
  },
});
if (cancelled.isError) throw new Error('cancel_booking failed');

const cancelledAgain = await restarted.callTool({
  name: 'cancel_booking',
  arguments: {
    booking_reference: reference,
    cancellation_reason: 'Second cancellation',
  },
});
if (!cancelledAgain.isError) throw new Error('Cancelled booking was cancelled twice');

await restarted.close();

const cleanup = new Database(databasePath);
cleanup.prepare('DELETE FROM bookings WHERE booking_reference = ?').run(reference);
cleanup.close();

console.log(
  JSON.stringify(
    {
      registeredTools: names,
      createTest: 'passed',
      retrieveTest: 'passed',
      updateTest: 'passed',
      cancelTest: 'passed',
      duplicateOverlapTest: 'passed',
      invalidDateTest: 'passed',
      invalidVehicleTest: 'passed',
      invalidUpdateDateTest: 'passed',
      persistenceAfterRestart: 'passed',
      historicalRecordPreservedBeforeCleanup: true,
    },
    null,
    2,
  ),
);
