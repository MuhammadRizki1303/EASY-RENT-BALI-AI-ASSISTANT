import { openDatabase } from './connection.js';
import { runMigrations } from './migrate.js';

export interface VehicleSeed {
  id: string;
  brand: string;
  model: string;
  year: number;
  vehicleType: string;
  transmission: 'MANUAL' | 'AUTOMATIC';
  seats: number;
  fuelType: string;
  dailyPrice: number;
  description: string;
  features: string[];
  imageUrl: string | null;
  availabilityStatus: 'AVAILABLE' | 'UNAVAILABLE';
}

export const developmentVehicleSeeds: VehicleSeed[] = [
  {
    id: 'DEV-TOYOTA-AVANZA',
    brand: 'Toyota',
    model: 'Avanza',
    year: 2024,
    vehicleType: 'MPV',
    transmission: 'AUTOMATIC',
    seats: 7,
    fuelType: 'PETROL',
    dailyPrice: 550000,
    description: 'Development sample MPV for family trips and airport transfers.',
    features: ['Air conditioning', 'USB charging', 'Bluetooth audio'],
    imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-TOYOTA-INNOVA',
    brand: 'Toyota',
    model: 'Innova Reborn',
    year: 2025,
    vehicleType: 'MPV',
    transmission: 'AUTOMATIC',
    seats: 7,
    fuelType: 'DIESEL',
    dailyPrice: 750000,
    description: 'Development sample premium MPV with spacious cabin comfort.',
    features: ['Air conditioning', 'Rear camera', 'Leather seats'],
    imageUrl: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-MITSUBISHI-XPANDER',
    brand: 'Mitsubishi',
    model: 'Xpander',
    year: 2024,
    vehicleType: 'MPV',
    transmission: 'AUTOMATIC',
    seats: 7,
    fuelType: 'PETROL',
    dailyPrice: 575000,
    description: 'Development sample modern MPV for comfortable group travel.',
    features: ['Air conditioning', 'Touchscreen', 'USB charging'],
    imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-HONDA-BRIO',
    brand: 'Honda',
    model: 'Brio',
    year: 2024,
    vehicleType: 'HATCHBACK',
    transmission: 'AUTOMATIC',
    seats: 5,
    fuelType: 'PETROL',
    dailyPrice: 425000,
    description: 'Development sample compact hatchback for efficient city travel.',
    features: ['Air conditioning', 'Reverse camera', 'Bluetooth audio'],
    imageUrl: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-SUZUKI-ERTIGA',
    brand: 'Suzuki',
    model: 'Ertiga',
    year: 2023,
    vehicleType: 'MPV',
    transmission: 'MANUAL',
    seats: 7,
    fuelType: 'PETROL',
    dailyPrice: 500000,
    description: 'Development sample practical family MPV with flexible luggage space.',
    features: ['Air conditioning', 'Foldable seats', 'USB charging'],
    imageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-TOYOTA-RAIZE',
    brand: 'Toyota',
    model: 'Raize',
    year: 2025,
    vehicleType: 'SUV',
    transmission: 'AUTOMATIC',
    seats: 5,
    fuelType: 'PETROL',
    dailyPrice: 475000,
    description: 'Development sample compact SUV for Bali road trips.',
    features: ['Air conditioning', 'Reverse camera', 'Wireless display'],
    imageUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-DAIHATSU-XENIA',
    brand: 'Daihatsu',
    model: 'Xenia',
    year: 2023,
    vehicleType: 'MPV',
    transmission: 'MANUAL',
    seats: 7,
    fuelType: 'PETROL',
    dailyPrice: 450000,
    description: 'Development sample efficient seven-seat MPV.',
    features: ['Air conditioning', 'Foldable seats', 'USB charging'],
    imageUrl: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
  {
    id: 'DEV-TOYOTA-FORTUNER',
    brand: 'Toyota',
    model: 'Fortuner',
    year: 2025,
    vehicleType: 'SUV',
    transmission: 'AUTOMATIC',
    seats: 7,
    fuelType: 'DIESEL',
    dailyPrice: 950000,
    description: 'Development sample premium SUV for group and long-distance travel.',
    features: ['Air conditioning', 'Leather seats', 'Parking sensors', 'Four-wheel drive'],
    imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=800&q=80',
    availabilityStatus: 'AVAILABLE',
  },
];

export function seedDevelopmentVehicles(database = openDatabase()) {
  runMigrations(database);
  const upsert = database.prepare(`
    INSERT INTO vehicles (
      id, brand, model, year, vehicle_type, transmission, seats, fuel_type,
      daily_price, description, features, image_url, availability_status
    ) VALUES (
      @id, @brand, @model, @year, @vehicleType, @transmission, @seats, @fuelType,
      @dailyPrice, @description, @features, @imageUrl, @availabilityStatus
    )
    ON CONFLICT(id) DO UPDATE SET
      brand = excluded.brand,
      model = excluded.model,
      year = excluded.year,
      vehicle_type = excluded.vehicle_type,
      transmission = excluded.transmission,
      seats = excluded.seats,
      fuel_type = excluded.fuel_type,
      daily_price = excluded.daily_price,
      description = excluded.description,
      features = excluded.features,
      image_url = excluded.image_url,
      availability_status = excluded.availability_status,
      updated_at = datetime('now')
  `);

  const seed = database.transaction(() => {
    for (const vehicle of developmentVehicleSeeds) {
      upsert.run({
        ...vehicle,
        features: JSON.stringify(vehicle.features),
      });
    }
  });
  seed();
  return developmentVehicleSeeds.length;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const database = openDatabase();
  const count = seedDevelopmentVehicles(database);
  database.close();
  console.log(`Seeded ${count} development sample vehicles.`);
}
