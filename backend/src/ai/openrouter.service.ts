import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

export const EASY_RENT_SYSTEM_PROMPT = `You are Easy Rent Bali AI Assistant.

You are a professional and friendly vehicle rental assistant.
Your default language is Indonesian. You can also communicate in English.

You help customers search vehicles, check rental prices, verify availability, manage bookings, and handle payments.
Use MCP Server A (inventory tools) for vehicle information and availability checks.
Use MCP Server B (booking tools) for booking operations and payment tracking.
Never invent vehicle data, pricing, availability, booking references, or payment details.

## Booking & Payment flow — MUST follow this order:
1. When user asks to see or search available cars (e.g. Cari mobil, tampilkan mobil yang tersedia, mobil apa saja yang tersedia), IMMEDIATELY call search_vehicles right away! DO NOT ask preliminary questions or chat back without calling search_vehicles.
2. When the user has specified dates (e.g. 2026-11-25 s/d 2026-11-26), call search_vehicles with check_start_date and check_end_date. If user has not specified dates yet, call search_vehicles without date filters to show the fleet catalog immediately!
3. Present the returned cars with a brief, clean summary (name, daily price, seats, transmission). The app UI will also automatically render the visual vehicle cards below your message.
4. If a vehicle has a PENDING or CONFIRMED booking overlapping with the requested rental dates, it is STRICTLY UNAVAILABLE and CANNOT be booked until the return date (end_date) passes.
5. When presenting vehicles to the customer, you can number them (1, 2, etc.), but ALWAYS keep track of their real vehicle ID (e.g. DEV-TOYOTA-RAIZE, DEV-TOYOTA-FORTUNER).
6. If the user replies with a number (e.g. 1 or 2) or a model name (e.g. Raize, Avanza), match it back to the vehicle shown in your previous message and use its real vehicle ID (or model name) when calling check_vehicle_availability or create_booking. NEVER pass a bare list index like 1 or 2 as vehicle_id!
7. Ask for ALL required booking fields if not yet provided:
   - customer_name (full name)
   - customer_phone (phone number with country code, e.g. +628123456789)
   - start_date and end_date (YYYY-MM-DD format)
   - pickup_location and return_location
8. Use check_vehicle_availability to verify the vehicle is free for those dates before booking.
9. Call create_booking after ALL fields above are confirmed and availability is verified.
   The backend will intercept the call and present a confirmation dialog — do NOT execute it yourself.
10. Once the booking is confirmed (status CONFIRMED), the customer can make a payment.
   Available payment methods: CASH, BANK_TRANSFER, CREDIT_CARD, QRIS, OVO, GOPAY, DANA.
   Use create_payment to create a payment record (e.g. FULL payment or DEPOSIT).
11. If the customer inquires about their payment or balance, use get_payment_status or get_booking.

## Important rules:
- ACT IMMEDIATELY: Never answer with asking how many cars or what dates when the user asks what cars are available without first calling search_vehicles and showing the cars! Always call search_vehicles on the very first turn when asked about cars.
- KEEP RESPONSES SHORT & CONCISE: Do not write very long paragraphs or re-list every specification that is already visible in the cards. A concise 2-3 line reply in Indonesian is fastest and best.
- FILTER BY DATE ON EVERY SEARCH: Whenever the user provides rental dates, you MUST pass check_start_date and check_end_date to search_vehicles. Never show a vehicle that is already booked for the requested dates. Vehicles with existing PENDING or CONFIRMED bookings during that period must be excluded from search results entirely.
- STRICT AVAILABILITY: If a vehicle is already booked (status PENDING or CONFIRMED) during the requested date range, it CANNOT be booked by anyone else until it is returned. Explain clearly to the customer if a car is currently booked for their requested dates and offer other available vehicles from our fleet.
- NEVER pass index numbers (like 1, 2) as vehicle_id. Always map to the actual vehicle ID (e.g. DEV-TOYOTA-RAIZE) or model name (Raize).
- Never call create_booking with missing or placeholder field values.
- If the tool returns an error saying Vehicle is unavailable for the selected dates or has conflicting booking, tell the customer honestly that the vehicle is already booked for those dates until its return date, and recommend other available vehicles.
- If a tool returns an error about missing data, ask the customer for that specific missing data.
- Never ask the user to confirm a booking or payment by typing a chat message. Tell them to use the confirmation dialog shown on screen.
- Never claim a booking or payment operation succeeded before receiving actual confirmation from MCP Server B.
- Keep responses clear, concise, professional, and helpful.`;

export type OpenRouterToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface OpenRouterHealth {
  configured: boolean;
  reachable: boolean;
  model: string | null;
  error?: string;
}

export class OpenRouterConfigurationError extends Error {}
export class OpenRouterRateLimitError extends Error {}
export class OpenRouterCreditsError extends Error {}
export class OpenRouterModelError extends Error {}
export class OpenRouterTimeoutError extends Error {}
export class OpenRouterNetworkError extends Error {}

export class OpenRouterService {
  private readonly client: OpenAI | null;
  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxToolRounds: number;
  private lastHealthCheck: { result: OpenRouterHealth; timestamp: number } | null = null;
  private readonly healthCacheTtlMs = 60000; // Cache health check for 60 seconds

  constructor(options?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    maxToolRounds?: number;
  }) {
    const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY;
    this.apiKey = apiKey || null;
    this.model = options?.model ?? process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct';
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.maxToolRounds = options?.maxToolRounds ?? 6;

    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          timeout: this.timeoutMs,
          defaultHeaders: {
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'Easy Rent Bali AI',
          },
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async healthCheck(force = false): Promise<OpenRouterHealth> {
    if (!this.apiKey || !this.client) {
      return { configured: false, reachable: false, model: null };
    }

    const now = Date.now();
    if (!force && this.lastHealthCheck && (now - this.lastHealthCheck.timestamp) < this.healthCacheTtlMs) {
      return this.lastHealthCheck.result;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout for health
    try {
      const response = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new OpenRouterConfigurationError('OpenRouter rejected the API credentials');
      }
      if (response.status === 429) {
        throw new OpenRouterRateLimitError('OpenRouter rate limit reached; please retry later');
      }
      if (response.status === 402) {
        throw new OpenRouterCreditsError('OpenRouter credits are insufficient');
      }
      if (!response.ok) {
        throw new OpenRouterNetworkError('OpenRouter connectivity check failed');
      }

      const healthResult: OpenRouterHealth = { configured: true, reachable: true, model: this.model };
      this.lastHealthCheck = { result: healthResult, timestamp: Date.now() };
      return healthResult;
    } catch (error) {
      const mapped = this.mapError(error);
      const healthResult: OpenRouterHealth = {
        configured: true,
        reachable: false,
        model: this.model,
        error: mapped.message,
      };
      // Only cache failure for 5 seconds to allow fast recovery
      this.lastHealthCheck = { result: healthResult, timestamp: Date.now() - (this.healthCacheTtlMs - 5000) };
      return healthResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  async sendMessage(
    userMessage: string,
    history: ChatCompletionMessageParam[] = [],
    tools: ChatCompletionTool[] = [],
    executeTool?: OpenRouterToolExecutor,
  ): Promise<{ content: string; toolNames: string[]; toolResults: unknown[] }> {
    if (!this.client) {
      throw new OpenRouterConfigurationError('OPENROUTER_API_KEY is not configured');
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: EASY_RENT_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];
    const toolNames: string[] = [];
    const toolResults: unknown[] = [];

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      let response;
      try {
        response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          max_tokens: 1200,
          temperature: 0.2,
        });
      } catch (error) {
        throw this.mapError(error);
      }

      const choice = response.choices[0];
      if (!choice) throw new OpenRouterNetworkError('OpenRouter returned no choices');

      const assistantMessage = choice.message;
      const toolCalls = assistantMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return {
          content: assistantMessage.content?.trim() || '',
          toolNames,
          toolResults,
        };
      }

      if (!executeTool) {
        throw new OpenRouterNetworkError('Tool calling requires an MCP tool executor');
      }

      messages.push(assistantMessage);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        const functionCall = toolCall as ChatCompletionMessageFunctionToolCall;
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(functionCall.function.arguments);
        } catch {
          throw new OpenRouterNetworkError(
            `Invalid arguments for tool ${functionCall.function.name}`,
          );
        }

        toolNames.push(functionCall.function.name);
        let result: unknown;
        try {
          result = await executeTool(functionCall.function.name, parsedArgs);
        } catch (error) {
          result = {
            error: error instanceof Error ? error.message : 'Tool execution failed',
          };
        }
        toolResults.push({
          tool: functionCall.function.name,
          result,
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    throw new OpenRouterNetworkError(`Tool execution exceeded ${this.maxToolRounds} rounds`);
  }

  private mapError(error: unknown): Error {
    if (
      error instanceof OpenRouterConfigurationError ||
      error instanceof OpenRouterRateLimitError ||
      error instanceof OpenRouterCreditsError ||
      error instanceof OpenRouterModelError ||
      error instanceof OpenRouterTimeoutError ||
      error instanceof OpenRouterNetworkError
    ) {
      return error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new OpenRouterTimeoutError('OpenRouter request timed out');
    }
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401 || error.status === 403) {
        return new OpenRouterConfigurationError('OpenRouter rejected the API credentials');
      }
      if (
        error.status === 400 &&
        /(not a valid model id|no endpoints found|model.*not found)/i.test(error.message)
      ) {
        return new OpenRouterModelError('The selected OpenRouter model is unavailable');
      }
      if (error.status === 429) {
        return new OpenRouterRateLimitError('OpenRouter rate limit reached; please retry later');
      }
      if (error.status === 402) {
        return new OpenRouterCreditsError('OpenRouter credits are insufficient');
      }
      if (error.status === 404) {
        return new OpenRouterModelError('The selected OpenRouter model is unavailable');
      }
    }

    if (error instanceof Error) {
      const text = error.message.toLowerCase();
      if (text.includes('timeout') || text.includes('timed out')) {
        return new OpenRouterTimeoutError('OpenRouter request timed out');
      }
      if (text.includes('network') || text.includes('fetch failed')) {
        return new OpenRouterNetworkError('OpenRouter network unavailable');
      }
    }

    return new OpenRouterNetworkError('OpenRouter request failed due to an unknown provider error');
  }
}
