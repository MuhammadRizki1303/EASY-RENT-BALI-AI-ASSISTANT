import {
  OpenRouterConfigurationError,
  OpenRouterCreditsError,
  OpenRouterModelError,
  OpenRouterNetworkError,
  OpenRouterRateLimitError,
  OpenRouterTimeoutError,
} from './openrouter.service.js';

export const OPENROUTER_TTS_MODEL = 'qwen/qwen3-tts-1.7b';
export const OPENROUTER_TTS_VOICES = [
  'vivian',
  'serena',
  'uncle_fu',
  'dylan',
  'eric',
  'ryan',
  'aiden',
  'ono_anna',
  'sohee',
] as const;

export type OpenRouterTtsVoice = (typeof OPENROUTER_TTS_VOICES)[number];

export class OpenRouterSpeechService {
  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    fetcher?: typeof fetch;
  }) {
    this.apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY ?? null;
    this.model = options?.model ?? process.env.OPENROUTER_TTS_MODEL ?? OPENROUTER_TTS_MODEL;
    this.timeoutMs = options?.timeoutMs ?? 25000;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async synthesize(text: string, voice?: OpenRouterTtsVoice): Promise<Uint8Array> {
    if (!this.apiKey) {
      throw new OpenRouterConfigurationError('OPENROUTER_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'Easy Rent Bali AI',
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          response_format: 'mp3',
          ...(voice ? { voice } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new OpenRouterConfigurationError('OpenRouter rejected the API credentials');
        }
        if (response.status === 402) {
          throw new OpenRouterCreditsError('OpenRouter credits are insufficient');
        }
        if (response.status === 404) {
          throw new OpenRouterModelError('The selected OpenRouter TTS model is unavailable');
        }
        if (response.status === 429) {
          throw new OpenRouterRateLimitError('OpenRouter rate limit reached; please retry later');
        }
        throw new OpenRouterNetworkError('OpenRouter speech generation failed');
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('audio/')) {
        throw new OpenRouterNetworkError('OpenRouter returned an invalid speech response');
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024) {
        throw new OpenRouterNetworkError('OpenRouter returned an oversized speech payload');
      }

      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.length === 0 || audio.length > 8 * 1024 * 1024) {
        throw new OpenRouterNetworkError('OpenRouter returned an invalid speech payload');
      }
      return audio;
    } catch (error) {
      if (
        error instanceof OpenRouterConfigurationError ||
        error instanceof OpenRouterCreditsError ||
        error instanceof OpenRouterModelError ||
        error instanceof OpenRouterNetworkError ||
        error instanceof OpenRouterRateLimitError ||
        error instanceof OpenRouterTimeoutError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenRouterTimeoutError('OpenRouter speech request timed out');
      }
      if (error instanceof TypeError) {
        throw new OpenRouterNetworkError('OpenRouter network unavailable');
      }
      throw new OpenRouterNetworkError('OpenRouter speech request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
