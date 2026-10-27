import nock from 'nock';

export const LLM_ORIGIN = 'https://llm.test';

export function chatCompletion(content: string, usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 }) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1_790_000_000,
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage,
  };
}

/** Mock one `/v1/chat/completions` call; returns the captured request bodies. */
export function mockLlm(content: string | object, options: { status?: number; times?: number; origin?: string } = {}) {
  const bodies: Record<string, unknown>[] = [];
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  nock(options.origin ?? LLM_ORIGIN)
    .post('/v1/chat/completions', (body: Record<string, unknown>) => {
      bodies.push(body);
      return true;
    })
    .times(options.times ?? 1)
    .reply(options.status ?? 200, options.status && options.status >= 400 ? { error: { message: 'boom' } } : chatCompletion(text));
  return bodies;
}
