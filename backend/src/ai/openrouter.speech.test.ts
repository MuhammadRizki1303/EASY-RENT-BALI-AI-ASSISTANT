import { describe, expect, it, vi } from 'vitest';
import { OpenRouterConfigurationError, OpenRouterRateLimitError } from './openrouter.service.js';
import { OpenRouterSpeechService } from './openrouter.speech.service.js';

describe('OpenRouterSpeechService', () => {
  it('sends the configured TTS request and returns raw audio bytes', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([0x49, 0x44, 0x33]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
    );
    const service = new OpenRouterSpeechService({
      apiKey: 'test-key',
      fetcher,
    });

    const audio = await service.synthesize('Halo, selamat datang.');

    expect([...audio]).toEqual([0x49, 0x44, 0x33]);
    expect(fetcher).toHaveBeenCalledOnce();
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error('Expected the speech request to call OpenRouter');
    const [url, init] = call;
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'qwen/qwen3-tts-1.7b',
      input: 'Halo, selamat datang.',
      response_format: 'mp3',
    });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key');
  });

  it('does not make a request without an API key', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new OpenRouterSpeechService({ apiKey: '', fetcher });

    await expect(service.synthesize('Hello')).rejects.toBeInstanceOf(OpenRouterConfigurationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps provider rate limits without exposing the response body', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('provider detail', { status: 429 }),
    );
    const service = new OpenRouterSpeechService({
      apiKey: 'test-key',
      fetcher,
    });

    await expect(service.synthesize('Hello')).rejects.toBeInstanceOf(OpenRouterRateLimitError);
  });
});
