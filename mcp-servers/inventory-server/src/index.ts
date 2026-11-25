import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ─── Database ─────────────────────────────────────────────────────────────────

export interface InventoryDatabaseOptions {
  databasePath?: string;
}

export function resolveDatabasePath(databasePath?: string): string {
  if (databasePath) return path.resolve(databasePath);
  const configured = process.env.DATABASE_URL?.startsWith('file:')
    ? process.env.DATABASE_URL.slice(5)
    : undefined;
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../backend/data/easy-rent-bali.db',
      );
}

export function openInventoryDatabase(options: InventoryDatabaseOptions = {}) {
  const databasePath = resolveDatabasePath(options.databasePath);
  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database not found: ${databasePath}`);
  }
  const database = new Database(databasePath, { readonly: true });
  database.pragma('query_only = ON');
  database.pragma('foreign_keys = ON');
  return database;
}

/**
 * Finds a vehicle by exact ID, or case-insensitive match on ID,
 * or partial match on model or brand (e.g. 'Raize', 'Toyota Raize').
 */
export function findVehicle(database: Database.Database, vehicleIdOrName: string) {
  const trimmed = vehicleIdOrName.trim();
  // 1. Exact ID
  let vehicle = database.prepare('SELECT * FROM vehicles WHERE id = ?').get(trimmed);
  if (vehicle) return vehicle;

  // 2. Case-insensitive exact ID
  vehicle = database.prepare('SELECT * FROM vehicles WHERE LOWER(id) = LOWER(?)').get(trimmed);
  if (vehicle) return vehicle;

  // 3. Exact model match (case-insensitive)
  vehicle = database.prepare('SELECT * FROM vehicles WHERE LOWER(model) = LOWER(?)').get(trimmed);
  if (vehicle) return vehicle;

  // 4. Combined 'Brand Model' match
  vehicle = database.prepare("SELECT * FROM vehicles WHERE LOWER(brand || ' ' || model) = LOWER(?)").get(trimmed);
  if (vehicle) return vehicle;

  // 5. Partial model or ID match
  vehicle = database.prepare("SELECT * FROM vehicles WHERE LOWER(model) LIKE LOWER(?) OR LOWER(id) LIKE LOWER(?)").get(`%${trimmed}%`, `%${trimmed}%`);
  return vehicle;
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function createInventoryServer(options: InventoryDatabaseOptions = {}) {
  const database = openInventoryDatabase(options);
  const dataSource =
    process.env.NODE_ENV === 'production' && process.env.SEED_DEVELOPMENT_DATA !== 'true'
      ? 'database'
      : 'development-sample-data';

  const server = new McpServer(
    {
      name: 'easy-rent-inventory-server',
      version: '2.0.0',
    },
    {
      instructions:
        'Read-only Easy Rent Bali vehicle inventory and availability tools. ' +
        'Always use check_vehicle_availability before creating a booking.',
    },
  );

  // ── search_vehicles ────────────────────────────────────────────────────────
  server.registerTool(
    'search_vehicles',
    {
      title: 'Search Vehicles',
      description:
        'Search the vehicle inventory with optional filters. ' +
        'All filters are optional — omit or leave empty to return all vehicles. ' +
        'IMPORTANT: When the customer specifies rental dates, ALWAYS pass check_start_date and check_end_date ' +
        'so that vehicles already booked for those dates are excluded from results. ' +
        'By default only AVAILABLE vehicles are returned (only_available=true). ' +
        'Set only_available=false explicitly to also include UNAVAILABLE fleet units.',
      inputSchema: {
        brand: z
          .string()
          .trim()
          .optional()
          .transform((v) => v || undefined),
        model: z
          .string()
          .trim()
          .optional()
          .transform((v) => v || undefined),
        vehicle_type: z
          .string()
          .trim()
          .optional()
          .transform((v) => v || undefined),
        transmission: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
        min_seats: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .transform((v) => (v !== undefined && v <= 0 ? undefined : v)),
        max_daily_price: z.coerce
          .number()
          .int()
          .nonnegative()
          .optional()
          .transform((v) => (v === 0 ? undefined : v)),
        /** Only return vehicles with AVAILABLE fleet status. Defaults to true. */
        only_available: z.coerce.boolean().optional().default(true),
        /** If provided together with check_end_date, only return vehicles free in that period (not booked by another customer). */
        check_start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .transform((v) => v || undefined),
        check_end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .transform((v) => v || undefined),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (args.brand) {
        clauses.push('LOWER(v.brand) LIKE LOWER(?)');
        parameters.push(`%${args.brand}%`);
      }
      if (args.model) {
        clauses.push('LOWER(v.model) LIKE LOWER(?)');
        parameters.push(`%${args.model}%`);
      }
      if (args.vehicle_type) {
        clauses.push('LOWER(v.vehicle_type) LIKE LOWER(?)');
        parameters.push(`%${args.vehicle_type}%`);
      }
      if (args.transmission) {
        clauses.push('v.transmission = ?');
        parameters.push(args.transmission);
      }
      if (args.min_seats !== undefined) {
        clauses.push('v.seats >= ?');
        parameters.push(args.min_seats);
      }
      if (args.max_daily_price !== undefined) {
        clauses.push('v.daily_price <= ?');
        parameters.push(args.max_daily_price);
      }
      if (args.only_available) {
        clauses.push("v.availability_status = 'AVAILABLE'");
      }

      // Date-range availability filter using NOT EXISTS subquery
      if (args.check_start_date && args.check_end_date) {
        if (args.check_end_date > args.check_start_date) {
          clauses.push(`
            NOT EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.vehicle_id = v.id
                AND b.booking_status IN ('PENDING', 'CONFIRMED')
                AND b.start_date < ?
                AND b.end_date > ?
            )
          `);
          parameters.push(args.check_end_date, args.check_start_date);
        }
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = database
        .prepare(`SELECT v.* FROM vehicles v ${where} ORDER BY v.brand, v.model`)
        .all(...parameters);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              dataSource,
              count: rows.length,
              vehicles: rows,
              filters: {
                brand: args.brand,
                model: args.model,
                vehicle_type: args.vehicle_type,
                transmission: args.transmission,
                min_seats: args.min_seats,
                max_daily_price: args.max_daily_price,
                only_available: args.only_available,
                check_start_date: args.check_start_date,
                check_end_date: args.check_end_date,
              },
            }),
          },
        ],
        structuredContent: {
          dataSource,
          count: rows.length,
          vehicles: rows,
        },
      };
    },
  );

  // ── get_vehicle_details ────────────────────────────────────────────────────
  server.registerTool(
    'get_vehicle_details',
    {
      title: 'Get Vehicle Details',
      description: 'Retrieve complete information for a single vehicle by its ID or model name.',
      inputSchema: {
        vehicle_id: z.string().trim().min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ vehicle_id }) => {
      const vehicle = findVehicle(database, vehicle_id);

      if (!vehicle) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Vehicle not found: ${vehicle_id}. Please use search_vehicles to see the list of valid vehicle IDs.` }],
          structuredContent: {
            found: false,
            vehicleId: vehicle_id,
            reason: `Vehicle not found with ID or name '${vehicle_id}'`,
          },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ dataSource, found: true, vehicle }),
          },
        ],
        structuredContent: { dataSource, found: true, vehicle },
      };
    },
  );

  // ── check_vehicle_availability ─────────────────────────────────────────────
  server.registerTool(
    'check_vehicle_availability',
    {
      title: 'Check Vehicle Availability',
      description:
        'Check if a specific vehicle is available for a given date range. ' +
        'Pass the vehicle_id (e.g. DEV-TOYOTA-RAIZE, or vehicle model name like Raize). ' +
        'Checks against PENDING and CONFIRMED bookings. ' +
        'Always call this before creating a booking.',
      inputSchema: {
        vehicle_id: z.string().trim().min(1),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ vehicle_id, start_date, end_date }) => {
      // Date validation
      const validateDate = (value: string) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };

      if (!validateDate(start_date) || !validateDate(end_date)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Invalid date value. Use YYYY-MM-DD format.' }],
          structuredContent: { available: false, reason: 'Invalid date value' },
        };
      }
      if (end_date <= start_date) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'start_date must be before end_date.' }],
          structuredContent: { available: false, reason: 'start_date must be before end_date' },
        };
      }

      const vehicle = findVehicle(database, vehicle_id) as
        | { id: string; availability_status: string; brand: string; model: string }
        | undefined;

      if (!vehicle) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Vehicle not found with identifier '${vehicle_id}'. Ensure you use the exact vehicle ID from search_vehicles (e.g. DEV-TOYOTA-RAIZE), not an index number.`,
            },
          ],
          structuredContent: {
            available: false,
            reason: `Vehicle not found for identifier '${vehicle_id}'. Please check vehicle ID with search_vehicles.`,
          },
        };
      }

      // Also warn if the vehicle is marked UNAVAILABLE in the fleet catalogue.
      if (vehicle.availability_status === 'UNAVAILABLE') {
        return {
          isError: true,
          content: [{ type: 'text', text: `${vehicle.brand} ${vehicle.model} is currently marked as UNAVAILABLE in the fleet.` }],
          structuredContent: {
            available: false,
            reason: `${vehicle.brand} ${vehicle.model} is marked as UNAVAILABLE in the fleet catalogue`,
          },
        };
      }

      const conflicts = database
        .prepare(
          `
          SELECT booking_reference, start_date, end_date, booking_status
          FROM bookings
          WHERE vehicle_id = ?
            AND booking_status IN ('PENDING', 'CONFIRMED')
            AND start_date < ?
            AND end_date > ?
          ORDER BY start_date
        `,
        )
        .all(vehicle.id, end_date, start_date);

      const available = conflicts.length === 0;
      const result = {
        dataSource,
        vehicle,
        requestedDates: { startDate: start_date, endDate: end_date },
        available,
        reason: available
          ? `${vehicle.brand} ${vehicle.model} (${vehicle.id}) is available for the requested period.`
          : `${vehicle.brand} ${vehicle.model} (${vehicle.id}) has ${conflicts.length} conflicting booking(s) for the requested period.`,
        conflicts,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  return { server, database };
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main() {
  const { server, database } = createInventoryServer();
  const transport = new StdioServerTransport();
  server.server.onclose = () => database.close();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Inventory MCP startup failed');
  process.exit(1);
});
