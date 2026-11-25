import { Platform } from 'react-native';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  vehicle_type: string;
  transmission: 'MANUAL' | 'AUTOMATIC';
  seats: number;
  fuel_type: string;
  daily_price: number;
  description: string;
  features: string[] | string;
  image_url: string | null;
  availability_status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface Booking {
  id: number;
  booking_reference: string;
  customer_name: string;
  customer_phone: string;
  vehicle_id: string;
  start_date: string;
  end_date: string;
  pickup_location: string;
  return_location: string;
  notes: string | null;
  total_estimated_price: number;
  booking_status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export interface Payment {
  id: number;
  payment_reference: string;
  booking_reference: string;
  amount: number;
  payment_method: string;
  payment_status: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  payment_type: 'FULL' | 'DEPOSIT' | 'REMAINING';
  notes: string | null;
  paid_at: string | null;
}

export interface PaymentSummary {
  totalEstimated: number;
  totalPaid: number;
  remainingAmount: number;
  isFullyPaid: boolean;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'user' | 'admin';
}

export interface AdminStats {
  totalVehicles: number;
  availableVehicles: number;
  totalBookings: number;
  confirmedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
}

export interface AdminOverview {
  vehicles: Vehicle[];
  bookings: (Booking & { paid_total?: number })[];
  payments: Payment[];
  stats: AdminStats;
  operationStatus: string;
}

export interface ChatResponse {
  conversationId: string;
  message: string;
  operationStatus: 'success' | 'error' | 'rejected' | string;
  pendingConfirmation: {
    requiresExplicitConfirmation: true;
    summary: string;
    expiresInMs: number;
  } | null;
  toolActivity?: string[];
  vehicles?: Vehicle[];
  booking?: Booking;
}

export interface HealthStatus {
  status: 'connected' | 'disconnected' | 'unknown';
  detail?: string;
}

export type SpeechVoice =
  'vivian' | 'serena' | 'uncle_fu' | 'dylan' | 'eric' | 'ryan' | 'aiden' | 'ono_anna' | 'sohee';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    const body = (await response.json().catch(() => null)) as
      (T & { error?: string; code?: string }) | null;
    if (!response.ok) {
      throw new Error(body?.error || `Backend request failed (${response.status})`);
    }
    if (body === null) throw new Error('Backend returned an empty response');
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Koneksi ke layanan terlalu lama. Silakan coba kembali.');
    }
    if (error instanceof TypeError) {
      throw new Error('Backend tidak dapat dijangkau. Periksa koneksi jaringan.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSpeech(text: string, voice?: SpeechVoice): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Pembuatan suara gagal (${response.status})`);
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) {
      throw new Error('Backend mengembalikan format audio yang tidak valid.');
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0 || audio.length > 8 * 1024 * 1024) {
      throw new Error('Backend mengembalikan ukuran audio yang tidak valid.');
    }
    return audio;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Pembuatan audio terlalu lama. Silakan coba kembali.');
    }
    if (error instanceof TypeError) {
      throw new Error('Backend tidak dapat dijangkau untuk membuat audio.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get baseUrl() {
    return API_BASE_URL;
  },
  chat(conversationId: string, message: string) {
    return request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, message }),
    });
  },
  synthesizeSpeech(text: string, voice?: SpeechVoice) {
    return requestSpeech(text, voice);
  },
  confirmBooking(conversationId: string, decision: 'confirm' | 'cancel') {
    return request<ChatResponse>('/api/chat/confirm', {
      method: 'POST',
      body: JSON.stringify({ conversationId, decision }),
    });
  },
  resetChat(conversationId: string) {
    return request<{ conversationId: string; operationStatus: string }>('/api/chat/reset', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
  },
  lookupBooking(reference: string) {
    return request<{
      booking: Booking;
      payments?: Payment[];
      paymentSummary?: PaymentSummary;
      operationStatus: string;
    }>(`/api/bookings/${encodeURIComponent(reference)}`);
  },
  payBooking(options: {
    booking_reference: string;
    amount?: number;
    payment_method?: 'QRIS' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'OVO' | 'GOPAY' | 'DANA' | 'CASH';
    payment_type?: 'FULL' | 'DEPOSIT' | 'REMAINING';
    notes?: string;
  }) {
    return request<{
      operationStatus: string;
      message: string;
      booking: Booking;
      payments: Payment[];
      paymentSummary: PaymentSummary;
    }>('/api/payments/pay', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },
  login(username: string, password: string) {
    return request<{
      operationStatus: string;
      user: User;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  getAdminOverview() {
    return request<AdminOverview>('/api/admin/overview');
  },
  updateAdminVehicle(id: string, status: 'AVAILABLE' | 'UNAVAILABLE') {
    return request<{
      operationStatus: string;
      vehicle: Vehicle;
    }>(`/api/admin/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ availability_status: status }),
    });
  },
  updateAdminBooking(reference: string, status: 'PENDING' | 'CONFIRMED' | 'CANCELLED') {
    return request<{
      operationStatus: string;
      booking: Booking;
    }>(`/api/admin/bookings/${encodeURIComponent(reference)}`, {
      method: 'PATCH',
      body: JSON.stringify({ booking_status: status }),
    });
  },
  async health(): Promise<{
    backend: HealthStatus;
    llm: HealthStatus;
    mcp: HealthStatus;
  }> {
    const [backend, llm, mcp] = await Promise.allSettled([
      request<{ status: string }>('/api/health'),
      request<{ configured: boolean; reachable: boolean }>('/api/health/llm'),
      request<{ inventory: boolean; booking: boolean }>('/api/health/mcp'),
    ]);
    return {
      backend:
        backend.status === 'fulfilled' ? { status: 'connected' } : { status: 'disconnected' },
      llm:
        llm.status === 'fulfilled' && llm.value.configured && llm.value.reachable
          ? { status: 'connected' }
          : {
              status: 'disconnected',
              detail: 'OpenRouter belum dikonfigurasi atau tidak terjangkau',
            },
      mcp:
        mcp.status === 'fulfilled' && mcp.value.inventory && mcp.value.booking
          ? { status: 'connected' }
          : { status: 'disconnected' },
    };
  },
};

export function getFeatures(vehicle: Vehicle): string[] {
  if (Array.isArray(vehicle.features)) return vehicle.features;
  try {
    const parsed: unknown = JSON.parse(vehicle.features);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}
