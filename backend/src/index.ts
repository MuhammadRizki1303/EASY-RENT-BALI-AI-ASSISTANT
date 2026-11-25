import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { openDatabase } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { seedDevelopmentVehicles } from './database/seed.js';
import {
  addMessage,
  deleteConversation,
  findUser,
  getBooking,
  getPayment,
  getPaymentsForBooking,
  getMessages,
  listAllBookings,
  listAllPayments,
  listVehicles,
  updateBookingStatus,
  updateVehicleStatus,
} from './database/repositories.js';
import {
  OpenRouterConfigurationError,
  OpenRouterCreditsError,
  OpenRouterModelError,
  OpenRouterNetworkError,
  OpenRouterRateLimitError,
  OpenRouterService,
  OpenRouterTimeoutError,
} from './ai/openrouter.service.js';
import { OpenRouterSpeechService, OPENROUTER_TTS_VOICES } from './ai/openrouter.speech.service.js';
import { McpClientManager, McpConnectionError, McpTimeoutError } from './mcp/mcpClientManager.js';
import { PendingBookingActionManager } from './mcp/pendingBookingActions.js';
import { validateBody } from './middleware/validation.js';
import { requestLogger } from './middleware/logging.js';
import { apiTimeout } from './middleware/timeout.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(options?: {
  databaseUrl?: string;
  startMcp?: boolean;
  openRouterApiKey?: string;
}) {
  const app = express();
  const database = openDatabase(options?.databaseUrl);
  const openRouter = new OpenRouterService({ apiKey: options?.openRouterApiKey });
  const speech = new OpenRouterSpeechService({ apiKey: options?.openRouterApiKey });
  const mcp = new McpClientManager({ databaseUrl: options?.databaseUrl });
  const pendingActions = new PendingBookingActionManager();

  runMigrations(database);
  if (process.env.NODE_ENV !== 'production' || process.env.SEED_DEVELOPMENT_DATA === 'true') {
    seedDevelopmentVehicles(database);
  }

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(apiTimeout(Number(process.env.API_TIMEOUT_MS ?? 60000)));
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim())
        : true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    '/api/',
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
      limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      },
    }),
  );

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'easy-rent-bali-backend',
      database: 'initialized',
      operationStatus: 'ok',
    });
  });

  app.get('/api/health/llm', async (_request, response) => {
    const health = await openRouter.healthCheck();
    response.status(health.configured && health.reachable ? 200 : 503).json(health);
  });

  app.get('/api/health/mcp', (_request, response) => {
    response.json(mcp.getStatus());
  });

  const speechSchema = z.object({
    text: z.string().trim().min(1).max(2000),
    voice: z.enum(OPENROUTER_TTS_VOICES).optional(),
  });
  app.post(
    '/api/speech',
    rateLimit({
      windowMs: 60000,
      limit: 6,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: 'Batas pembuatan suara tercapai. Coba lagi sebentar.',
        code: 'TTS_RATE_LIMITED',
      },
    }),
    validateBody(speechSchema),
    async (request, response) => {
      try {
        const audio = await speech.synthesize(request.body.text, request.body.voice);
        response
          .status(200)
          .type('audio/mpeg')
          .set('Cache-Control', 'no-store')
          .send(Buffer.from(audio));
      } catch (error) {
        const failure = mapSpeechFailure(error);
        console.error(
          JSON.stringify({
            event: 'speech_generation_failed',
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
            code: failure.code,
          }),
        );
        response.status(failure.status).json({
          error: failure.message,
          code: failure.code,
          operationStatus: 'error',
        });
      }
    },
  );

  app.get('/api/vehicles', (_request, response) => {
    response.json({
      dataSource:
        process.env.NODE_ENV === 'production' && process.env.SEED_DEVELOPMENT_DATA !== 'true'
          ? 'database'
          : 'development-sample-data',
      vehicles: listVehicles(database),
      operationStatus: 'success',
    });
  });

  app.get('/api/bookings/:reference', (request, response) => {
    const booking = getBooking(database, request.params.reference);
    if (!booking) {
      response.status(404).json({
        error: 'Booking not found',
        code: 'BOOKING_NOT_FOUND',
        operationStatus: 'not_found',
      });
      return;
    }
    const payments = getPaymentsForBooking(database, request.params.reference);
    const totalPaid = payments
      .filter((p) => p.payment_status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = Math.max(0, booking.total_estimated_price - totalPaid);

    response.json({
      booking,
      payments,
      paymentSummary: {
        totalEstimated: booking.total_estimated_price,
        totalPaid,
        remainingAmount,
        isFullyPaid: remainingAmount === 0 && booking.total_estimated_price > 0,
      },
      operationStatus: 'success',
    });
  });

  app.get('/api/payments/:reference', (request, response) => {
    const payment = getPayment(database, request.params.reference);
    if (!payment) {
      response.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND',
        operationStatus: 'not_found',
      });
      return;
    }
    response.json({
      payment,
      operationStatus: 'success',
    });
  });

  const paySchema = z.object({
    booking_reference: z.string().trim().min(1).max(100),
    amount: z.coerce.number().int().positive().optional(),
    payment_method: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'QRIS', 'OVO', 'GOPAY', 'DANA']).default('QRIS'),
    payment_type: z.enum(['FULL', 'DEPOSIT', 'REMAINING']).default('FULL'),
    notes: z.string().trim().max(500).optional(),
    simulate_instant_paid: z.boolean().optional().default(true),
  });

  const loginSchema = z.object({
    username: z.string().trim().min(1).max(50),
    password: z.string().trim().min(1).max(100),
  });

  app.post('/api/auth/login', validateBody(loginSchema), (request, response) => {
    const { username, password } = request.body;
    const user = findUser(database, username);
    if (!user || user.password !== password) {
      response.status(401).json({
        error: 'Username atau password salah',
        code: 'INVALID_CREDENTIALS',
        operationStatus: 'error',
      });
      return;
    }

    response.json({
      operationStatus: 'success',
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.get('/api/admin/overview', (_request, response) => {
    const vehicles = listVehicles(database);
    const bookings = listAllBookings(database);
    const payments = listAllPayments(database);

    const totalRevenue = payments
      .filter((p) => p.payment_status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);

    response.json({
      operationStatus: 'success',
      vehicles,
      bookings,
      payments,
      stats: {
        totalVehicles: vehicles.length,
        availableVehicles: vehicles.filter((v) => v.availability_status === 'AVAILABLE').length,
        totalBookings: bookings.length,
        confirmedBookings: bookings.filter((b) => b.booking_status === 'CONFIRMED').length,
        pendingBookings: bookings.filter((b) => b.booking_status === 'PENDING').length,
        cancelledBookings: bookings.filter((b) => b.booking_status === 'CANCELLED').length,
        totalRevenue,
      },
    });
  });

  const updateVehicleStatusSchema = z.object({
    availability_status: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  });

  app.patch('/api/admin/vehicles/:id', validateBody(updateVehicleStatusSchema), (request, response) => {
    const vehicleId = String(request.params.id);
    const updated = updateVehicleStatus(database, vehicleId, request.body.availability_status);
    if (!updated) {
      response.status(404).json({
        error: 'Kendaraan tidak ditemukan',
        code: 'VEHICLE_NOT_FOUND',
        operationStatus: 'error',
      });
      return;
    }
    response.json({
      operationStatus: 'success',
      vehicle: updated,
    });
  });

  const updateBookingStatusSchema = z.object({
    booking_status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
  });

  app.patch('/api/admin/bookings/:reference', validateBody(updateBookingStatusSchema), (request, response) => {
    const bookingRef = String(request.params.reference);
    const updated = updateBookingStatus(database, bookingRef, request.body.booking_status);
    if (!updated) {
      response.status(404).json({
        error: 'Booking tidak ditemukan',
        code: 'BOOKING_NOT_FOUND',
        operationStatus: 'error',
      });
      return;
    }
    response.json({
      operationStatus: 'success',
      booking: updated,
    });
  });

  app.post('/api/payments/pay', validateBody(paySchema), async (request, response) => {
    try {
      const { booking_reference, payment_method, payment_type, notes, simulate_instant_paid } = request.body;
      const booking = getBooking(database, booking_reference);
      if (!booking) {
        response.status(404).json({
          error: 'Booking not found',
          code: 'BOOKING_NOT_FOUND',
          operationStatus: 'error',
        });
        return;
      }
      if (booking.booking_status === 'CANCELLED') {
        response.status(400).json({
          error: 'Booking sudah dibatalkan.',
          code: 'BOOKING_CANCELLED',
          operationStatus: 'error',
        });
        return;
      }

      // Calculate amount if not provided
      const existingPayments = getPaymentsForBooking(database, booking_reference);
      const totalPaid = existingPayments
        .filter((p) => p.payment_status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0);
      const remainingAmount = Math.max(0, booking.total_estimated_price - totalPaid);

      if (remainingAmount <= 0) {
        response.status(400).json({
          error: 'Booking ini sudah lunas.',
          code: 'ALREADY_PAID',
          operationStatus: 'error',
        });
        return;
      }

      const payAmount = request.body.amount ?? remainingAmount;

      // 1. Create payment record via MCP tool
      const createRes = await mcp.callTool('create_payment', {
        booking_reference,
        amount: payAmount,
        payment_method,
        payment_type,
        notes: notes || `Pembayaran melalui aplikasi (${payment_method})`,
      });

      if (createRes.isError) {
        response.status(400).json({
          error: 'Gagal membuat pembayaran.',
          code: 'PAYMENT_FAILED',
          toolResult: createRes,
        });
        return;
      }

      const createStructured = createRes.structuredContent as {
        payment?: { payment_reference: string };
      };
      const paymentRef = createStructured?.payment?.payment_reference;

      // 2. Process status:
      // For online QR/transfer/card methods, mark PAID immediately.
      // For CASH (Bayar Tunai), mark PAID upon user confirmation so the booking becomes CONFIRMED,
      // with a clear note that payment is collected on delivery.
      let finalPaymentResult = createRes;
      if (paymentRef) {
        const payNotes = payment_method === 'CASH'
          ? 'Konfirmasi bayar tunai (Cash on Delivery) saat pengambilan kendaraan'
          : `Pembayaran sukses via ${payment_method}`;

        finalPaymentResult = await mcp.callTool('mark_payment_paid', {
          payment_reference: paymentRef,
          notes: payNotes,
        });
      }

      // Fetch fresh updated booking & payments
      const updatedBooking = getBooking(database, booking_reference);
      const updatedPayments = getPaymentsForBooking(database, booking_reference);
      const newTotalPaid = updatedPayments
        .filter((p) => p.payment_status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0);
      const newRemaining = Math.max(0, (updatedBooking?.total_estimated_price ?? 0) - newTotalPaid);

      const successMsg = payment_method === 'CASH'
        ? 'Konfirmasi bayar tunai berhasil! Status booking Anda kini CONFIRMED dan armada siap disiapkan.'
        : `Pembayaran via ${payment_method} berhasil diverifikasi! Status booking Anda kini CONFIRMED.`;

      response.json({
        operationStatus: 'success',
        message: successMsg,
        booking: updatedBooking,
        payments: updatedPayments,
        paymentSummary: {
          totalEstimated: updatedBooking?.total_estimated_price ?? 0,
          totalPaid: newTotalPaid,
          remainingAmount: newRemaining,
          isFullyPaid: newRemaining === 0,
        },
        toolResult: finalPaymentResult,
      });
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Gagal memproses pembayaran.',
        code: 'INTERNAL_ERROR',
        operationStatus: 'error',
      });
    }
  });

  const chatResetSchema = z.object({
    conversationId: z.string().trim().min(1).max(120).optional(),
  });

  const confirmationSchema = z.object({
    conversationId: z.string().trim().min(1).max(120),
    decision: z.enum(['confirm', 'cancel']),
  });

  app.post('/api/chat/confirm', validateBody(confirmationSchema), async (request, response) => {
    const { conversationId, decision } = request.body;
    const pending = pendingActions.get(conversationId);
    if (!pending) {
      response.status(409).json({
        error: 'No pending booking action for this conversation',
        code: 'NO_PENDING_ACTION',
        operationStatus: 'rejected',
      });
      return;
    }

    pendingActions.consume(conversationId);
    if (decision === 'cancel') {
      response.json({
        conversationId,
        operationStatus: 'cancelled',
        message: 'Aksi booking dibatalkan. Tidak ada perubahan pada data booking.',
      });
      return;
    }

    try {
      const result = await mcp.callTool(pending.toolName, pending.args);
      const structured = result.structuredContent as
        | { booking?: Record<string, unknown>; payment?: Record<string, unknown> }
        | undefined;
      const booking = structured?.booking;
      const payment = structured?.payment;
      let message: string;
      if (result.isError) {
        message = 'Permintaan aksi belum berhasil diproses.';
      } else if (pending.toolName === 'create_booking') {
        message = 'Booking berhasil disimpan dengan status PENDING.';
      } else if (pending.toolName === 'confirm_booking') {
        message = 'Booking berhasil dikonfirmasi (CONFIRMED).';
      } else if (pending.toolName === 'create_payment') {
        message = 'Data pembayaran berhasil dibuat dengan status PENDING.';
      } else if (pending.toolName === 'mark_payment_paid') {
        message = 'Pembayaran berhasil diverifikasi dan ditandai LUNAS (PAID).';
      } else if (pending.toolName === 'refund_payment') {
        message = 'Pengembalian dana (refund) berhasil diproses.';
      } else if (pending.toolName === 'cancel_booking') {
        message = 'Booking berhasil dibatalkan.';
      } else {
        message = 'Aksi berhasil disimpan.';
      }

      addMessage(database, conversationId, 'user', 'Konfirmasi aksi melalui aplikasi.');
      addMessage(database, conversationId, 'assistant', message);
      response.status(result.isError ? 409 : 200).json({
        conversationId,
        message,
        operationStatus: result.isError ? 'error' : 'success',
        toolActivity: [`${pending.toolName}:${result.isError ? 'error' : 'success'}`],
        booking,
        payment,
        toolResult: result,
      });
    } catch {
      response.status(503).json({
        error: 'Layanan booking sementara tidak tersedia.',
        code: 'MCP_UNAVAILABLE',
        operationStatus: 'error',
      });
    }
  });

  app.post('/api/chat/reset', validateBody(chatResetSchema), (request, response) => {
    const conversationId = request.body.conversationId ?? `chat-${cryptoRandomId()}`;
    pendingActions.clear(conversationId);
    deleteConversation(database, conversationId);
    response.json({
      conversationId,
      operationStatus: 'reset',
      message: 'Conversation history reset for this session.',
    });
  });

  const chatSchema = z.object({
    conversationId: z.string().trim().min(1).max(120).optional(),
    message: z.string().trim().min(1).max(4000),
  });

  app.post('/api/chat', validateBody(chatSchema), async (request, response) => {
    const { message } = request.body;
    const conversationId = request.body.conversationId ?? `chat-${cryptoRandomId()}`;
    try {
      const pending = pendingActions.get(conversationId);
      if (pending) {
        response.status(409).json({
          conversationId,
          error: 'Gunakan dialog konfirmasi untuk menyetujui atau membatalkan aksi yang tertunda.',
          code: 'EXPLICIT_CONFIRMATION_REQUIRED',
          operationStatus: 'confirmation_required',
          pendingConfirmation: {
            requiresExplicitConfirmation: true,
            summary: pending.summary,
            expiresInMs: 10 * 60 * 1000,
          },
        });
        return;
      }

      addMessage(database, conversationId, 'user', message);

      const history = getMessages(database, conversationId, 30)
        .slice(0, -1)
        .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
        .map(
          (entry) =>
            ({
              role: entry.role,
              content: entry.content,
            }) as ChatCompletionMessageParam,
        );

      const tools = await mcp.getOpenRouterTools();
      const result = await openRouter.sendMessage(
        message,
        history,
        tools,
        async (toolName, args) => {
          if (pendingActions.isWriteTool(toolName)) {
            let estimatedTotalPrice: number | undefined;
            if (toolName === 'create_booking') {
              try {
                estimatedTotalPrice = await estimatePendingBooking(mcp, args);
              } catch (estimateError) {
                // Return a structured error so the AI understands what went wrong
                // instead of throwing and causing a confusing "unavailable" message.
                const reason =
                  estimateError instanceof Error
                    ? estimateError.message
                    : 'Could not estimate booking price';
                return {
                  isError: true,
                  reason,
                  instruction:
                    'Inform the customer about this specific problem and ask them to correct it. Do NOT say the vehicle is unavailable unless the reason explicitly says so.',
                };
              }
            }
            const pendingAction = pendingActions.create(
              conversationId,
              toolName,
              args,
              estimatedTotalPrice,
            );
            return {
              requiresExplicitConfirmation: true,
              proposedAction: pendingAction.summary,
              executed: false,
              instruction:
                'Ask the user to confirm exactly this pending action. Do not execute it.',
            };
          }
          return mcp.callTool(toolName, args);
        },
      );

      addMessage(database, conversationId, 'assistant', result.content);
      const pendingResponse = pendingActions.get(conversationId);
      const vehicleResults = extractVehiclesFromToolResults(result.toolResults);
      response.json({
        conversationId,
        message: result.content,
        operationStatus: 'success',
        pendingConfirmation: pendingResponse
          ? {
              requiresExplicitConfirmation: true,
              summary: pendingResponse.summary,
              expiresInMs: 10 * 60 * 1000,
            }
          : null,
        toolActivity: result.toolNames,
        vehicles: vehicleResults,
      });
    } catch (error) {
      const failure = mapChatFailure(error);
      console.error(
        JSON.stringify({
          event: 'chat_request_failed',
          conversationId,
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
          code: failure.code,
        }),
      );
      response.status(failure.status).json({
        error: failure.message,
        code: failure.code,
        operationStatus: 'error',
      });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return {
    app,
    database,
    mcp,
    openRouter,
    speech,
    pendingActions,
  };
}

async function estimatePendingBooking(
  mcp: McpClientManager,
  args: Record<string, unknown>,
): Promise<number> {
  const vehicleId = args.vehicle_id;
  const startDate = args.start_date;
  const endDate = args.end_date;
  if (
    typeof vehicleId !== 'string' ||
    typeof startDate !== 'string' ||
    typeof endDate !== 'string'
  ) {
    throw new Error('Booking requires a vehicle and valid start/end dates.');
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== startDate ||
    end.toISOString().slice(0, 10) !== endDate ||
    end.getTime() <= start.getTime()
  ) {
    throw new Error('Booking dates must be valid and the end date must be after the start date.');
  }

  const availability = await mcp.callTool('check_vehicle_availability', {
    vehicle_id: vehicleId,
    start_date: startDate,
    end_date: endDate,
  });
  if (availability.isError) {
    throw new Error('Vehicle and date availability could not be verified.');
  }
  const structured = availability.structuredContent as
    { available?: unknown; vehicle?: { daily_price?: unknown } } | undefined;
  if (structured?.available !== true) {
    throw new Error('Vehicle is unavailable for the selected dates.');
  }
  const dailyPrice = structured.vehicle?.daily_price;
  if (typeof dailyPrice !== 'number' || dailyPrice <= 0) {
    throw new Error('Vehicle rental price could not be verified.');
  }
  const rentalDays = (end.getTime() - start.getTime()) / 86400000;
  return rentalDays * dailyPrice;
}

export function extractVehiclesFromToolResults(toolResults: unknown[]): unknown[] {
  const vehicles = toolResults.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const toolResult = (entry as { result?: { structuredContent?: unknown } }).result;
    const structured = toolResult?.structuredContent;
    if (
      structured &&
      typeof structured === 'object' &&
      'vehicles' in structured &&
      Array.isArray((structured as { vehicles: unknown }).vehicles)
    ) {
      return (structured as { vehicles: unknown[] }).vehicles;
    }
    if (structured && typeof structured === 'object' && 'vehicle' in structured) {
      return [(structured as { vehicle: unknown }).vehicle];
    }
    return [];
  });
  const unique = new Map<string, unknown>();
  for (const vehicle of vehicles) {
    if (!vehicle || typeof vehicle !== 'object' || !('id' in vehicle)) continue;
    const id = (vehicle as { id: unknown }).id;
    if (typeof id === 'string' && !unique.has(id)) unique.set(id, vehicle);
  }
  return [...unique.values()];
}

function cryptoRandomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapChatFailure(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof OpenRouterRateLimitError) {
    return {
      status: 429,
      code: 'OPENROUTER_RATE_LIMITED',
      message: 'Layanan AI sedang mencapai batas permintaan. Tunggu sebentar lalu coba lagi.',
    };
  }
  if (error instanceof OpenRouterCreditsError) {
    return {
      status: 503,
      code: 'OPENROUTER_CREDITS_INSUFFICIENT',
      message: 'Kredit layanan AI tidak mencukupi. Hubungi administrator.',
    };
  }
  if (error instanceof OpenRouterConfigurationError) {
    return {
      status: 503,
      code: 'OPENROUTER_CONFIGURATION_ERROR',
      message: 'Konfigurasi layanan AI bermasalah. Hubungi administrator.',
    };
  }
  if (error instanceof OpenRouterModelError) {
    return {
      status: 503,
      code: 'OPENROUTER_MODEL_UNAVAILABLE',
      message: 'Model AI sedang tidak tersedia. Silakan coba lagi nanti.',
    };
  }
  if (error instanceof OpenRouterTimeoutError || error instanceof McpTimeoutError) {
    return {
      status: 504,
      code: 'AI_OR_MCP_TIMEOUT',
      message: 'Layanan AI atau kendaraan terlalu lama merespons. Silakan coba lagi.',
    };
  }
  if (error instanceof OpenRouterNetworkError || error instanceof McpConnectionError) {
    return {
      status: 503,
      code: 'LLM_OR_MCP_UNAVAILABLE',
      message: 'Layanan AI atau MCP sementara tidak tersedia.',
    };
  }
  return {
    status: 503,
    code: 'LLM_OR_MCP_UNAVAILABLE',
    message: 'Layanan AI atau MCP sementara tidak tersedia.',
  };
}

function mapSpeechFailure(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof OpenRouterRateLimitError) {
    return {
      status: 429,
      code: 'OPENROUTER_RATE_LIMITED',
      message: 'Layanan suara sedang mencapai batas permintaan. Coba lagi nanti.',
    };
  }
  if (error instanceof OpenRouterCreditsError) {
    return {
      status: 503,
      code: 'OPENROUTER_CREDITS_INSUFFICIENT',
      message: 'Kredit layanan suara tidak mencukupi. Hubungi administrator.',
    };
  }
  if (error instanceof OpenRouterConfigurationError) {
    return {
      status: 503,
      code: 'OPENROUTER_CONFIGURATION_ERROR',
      message: 'Konfigurasi layanan suara bermasalah. Hubungi administrator.',
    };
  }
  if (error instanceof OpenRouterModelError) {
    return {
      status: 503,
      code: 'OPENROUTER_MODEL_UNAVAILABLE',
      message: 'Model suara sedang tidak tersedia. Coba lagi nanti.',
    };
  }
  if (error instanceof OpenRouterTimeoutError) {
    return {
      status: 504,
      code: 'OPENROUTER_TTS_TIMEOUT',
      message: 'Pembuatan suara terlalu lama. Coba lagi.',
    };
  }
  if (error instanceof OpenRouterNetworkError) {
    return {
      status: 502,
      code: 'OPENROUTER_TTS_FAILED',
      message: 'Suara belum dapat dibuat. Coba lagi nanti.',
    };
  }
  return {
    status: 502,
    code: 'OPENROUTER_TTS_FAILED',
    message: 'Suara belum dapat dibuat. Coba lagi nanti.',
  };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const appResources = createApp();
  const port = Number(process.env.PORT ?? 3000);
  const server = appResources.app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });

  void appResources.mcp.connectDefaultServers().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Unable to start MCP client connections',
    );
  });

  const close = () => {
    void appResources.mcp.close().finally(() => {
      appResources.database.close();
      server.close();
    });
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
