export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface Vehicle {
  vehicleId: string;
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

export interface Booking {
  id: number;
  bookingReference: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  returnLocation: string;
  notes: string | null;
  totalEstimatedPrice: number;
  bookingStatus: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
}

export interface ChatResponse {
  conversationId: string;
  message: string;
  toolActivity?: string[];
  vehicles?: Vehicle[];
  booking?: Booking;
}
