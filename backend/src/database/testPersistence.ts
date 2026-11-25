import { openDatabase, resolveDatabasePath } from './connection.js';
import { runMigrations } from './migrate.js';
import { seedDevelopmentVehicles } from './seed.js';
import { createBooking, getBooking, getVehicle, listVehicles } from './repositories.js';

const databasePath = resolveDatabasePath();
const firstConnection = openDatabase();
runMigrations(firstConnection);
seedDevelopmentVehicles(firstConnection);

const vehicles = listVehicles(firstConnection);
const vehicle = getVehicle(firstConnection, 'DEV-TOYOTA-AVANZA');
if (!vehicle) throw new Error('Seeded test vehicle was not found');

const testReference = 'ERB-TEST-PERSISTENCE';
firstConnection.prepare('DELETE FROM bookings WHERE booking_reference = ?').run(testReference);

let testReferenceActual = testReference;
try {
  const booking = createBooking(firstConnection, {
    customerName: 'Persistence Test Customer',
    customerPhone: '+628123456789',
    vehicleId: vehicle.id,
    startDate: '2099-04-10',
    endDate: '2099-04-13',
    pickupLocation: 'Test Pickup',
    returnLocation: 'Test Return',
    notes: 'Automated persistence test - not a real booking',
  });
  testReferenceActual = booking.booking_reference;

  let overlapRejected = false;
  try {
    createBooking(firstConnection, {
      customerName: 'Overlap Test Customer',
      customerPhone: '+628123456790',
      vehicleId: vehicle.id,
      startDate: '2099-04-11',
      endDate: '2099-04-12',
      pickupLocation: 'Test Pickup',
      returnLocation: 'Test Return',
    });
  } catch (error) {
    overlapRejected = error instanceof Error && error.message.includes('unavailable');
  }
  if (!overlapRejected) throw new Error('Overlapping booking was not rejected');

  firstConnection.close();

  const restartedConnection = openDatabase();
  const persisted = getBooking(restartedConnection, testReferenceActual);
  if (!persisted) throw new Error('Booking did not persist after database restart');
  if (persisted.total_estimated_price !== 550000 * 3) {
    throw new Error('Estimated price calculation is incorrect');
  }

  restartedConnection
    .prepare('DELETE FROM bookings WHERE booking_reference = ?')
    .run(testReferenceActual);
  restartedConnection.close();

  console.log(
    JSON.stringify(
      {
        databasePath,
        vehicleCount: vehicles.length,
        testBookingRetrievedAfterRestart: true,
        testBookingReference: testReferenceActual,
        overlapBookingRejected: true,
        testBookingDeletedAfterVerification: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (firstConnection.open) firstConnection.close();
  throw error;
}
