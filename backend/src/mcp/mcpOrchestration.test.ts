import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../database/connection.js';
import { runMigrations } from '../database/migrate.js';
import { seedDevelopmentVehicles } from '../database/seed.js';
import { McpClientManager } from './mcpClientManager.js';
import { PendingBookingActionManager } from './pendingBookingActions.js';

const databasePath = path.resolve(process.cwd(), 'data/mcp-orchestration-test.db');
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${databasePath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}
const testDatabase = openDatabase(`file:${databasePath}`);
runMigrations(testDatabase);
seedDevelopmentVehicles(testDatabase);
testDatabase.close();

const mcp = new McpClientManager({
  timeoutMs: 15000,
  databaseUrl: `file:${databasePath}`,
});
try {
  await mcp.connectDefaultServers();
  const status = mcp.getStatus();
  if (!status.inventory || !status.booking) {
    throw new Error('MCP A or MCP B did not connect');
  }

  const tools = await mcp.getOpenRouterTools();
  const names = tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => tool.function.name)
    .sort();
  const expected = [
    'cancel_booking',
    'check_vehicle_availability',
    'confirm_booking',
    'create_booking',
    'create_payment',
    'get_booking',
    'get_payment_status',
    'get_vehicle_details',
    'mark_payment_paid',
    'refund_payment',
    'search_vehicles',
    'update_booking',
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected routed tools: ${names.join(', ')}`);
  }

  const search = await mcp.callTool('search_vehicles', {
    brand: 'Toyota',
    min_seats: 7,
  });
  if (search.isError || search.server !== 'inventory') {
    throw new Error('Inventory routing test failed');
  }

  const details = await mcp.callTool('get_vehicle_details', {
    vehicle_id: 'DEV-TOYOTA-AVANZA',
  });
  if (details.isError || details.server !== 'inventory') {
    throw new Error('Vehicle details routing test failed');
  }

  const pending = new PendingBookingActionManager();
  const action = pending.create(
    'test-conversation',
    'create_booking',
    {
      customer_name: 'Test Customer',
      customer_phone: '+628123456789',
      vehicle_id: 'DEV-TOYOTA-AVANZA',
      start_date: '2099-09-10',
      end_date: '2099-09-13',
      pickup_location: 'Test Pickup',
      return_location: 'Test Return',
      notes: 'MCP orchestration test',
    },
    1650000,
  );
  if (
    !action.summary.includes('Test Pickup') ||
    !action.summary.includes('Test Return') ||
    !action.summary.includes('Rp 1.650.000')
  ) {
    throw new Error('Pending booking review summary is incomplete');
  }
  if (pending.confirm('test-conversation', 'maybe') !== undefined) {
    throw new Error('Ambiguous confirmation was accepted');
  }
  if (!pending.get('test-conversation')) {
    throw new Error('Pending action was lost after ambiguous confirmation');
  }
  const confirmed = pending.confirm('test-conversation', 'ya');
  if (!confirmed || confirmed.fingerprint !== action.fingerprint) {
    throw new Error('Explicit confirmation did not match pending action');
  }

  console.log(
    JSON.stringify(
      {
        mcpStatus: status,
        discoveredTools: names,
        inventoryRoute: 'passed',
        vehicleDetailsRoute: 'passed',
        ambiguousConfirmationRejected: true,
        explicitConfirmationAccepted: true,
      },
      null,
      2,
    ),
  );
} finally {
  await mcp.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
