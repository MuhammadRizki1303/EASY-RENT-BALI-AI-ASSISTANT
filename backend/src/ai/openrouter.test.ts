import 'dotenv/config';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { OpenRouterService } from './openrouter.service.js';

const service = new OpenRouterService();
const health = await service.healthCheck();
console.log(
  JSON.stringify(
    {
      configured: health.configured,
      reachable: health.reachable,
      model: health.model,
      error: health.error,
    },
    null,
    2,
  ),
);

if (!health.configured) {
  console.log('Live test skipped: configure backend/.env locally. No secret values were printed.');
  process.exit(0);
}

if (!health.reachable) {
  process.exit(2);
}

const normalResponse = await service.sendMessage(
  'Jawab singkat: layanan ini untuk mencari mobil sewa di Bali.',
);
console.log(JSON.stringify({ normalResponse: normalResponse.content }, null, 2));

const temporaryTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'temporary_weather_probe',
    description: 'Return a temporary deterministic tool result for testing.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
      additionalProperties: false,
    },
  },
};

const toolResponse = await service.sendMessage(
  'Call temporary_weather_probe for location Bali.',
  [],
  [temporaryTool],
  async (name, args) => ({
    tool: name,
    arguments: args,
    result: 'temporary probe successful',
  }),
);
console.log(
  JSON.stringify(
    {
      toolResponse: toolResponse.content,
      toolsCalled: toolResponse.toolNames,
    },
    null,
    2,
  ),
);
