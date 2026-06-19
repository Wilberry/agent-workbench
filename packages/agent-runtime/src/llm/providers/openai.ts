import type { LLMRequest, LLMResponse, LLMProvider, LLMUsage } from '../types';
import { getPricingProvider } from '../pricing';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function normalizeUsage(payload: any): LLMUsage {
  return {
    prompt_tokens: Number(payload?.usage?.prompt_tokens ?? 0),
    completion_tokens: Number(payload?.usage?.completion_tokens ?? 0),
    total_tokens: Number(payload?.usage?.total_tokens ?? 0)
  };
}

function extractContent(payload: any): string {
  return payload?.choices?.[0]?.message?.content ?? '';
}

export const openaiProvider: LLMProvider = {
  name: 'openai',
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    const start = Date.now();
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 1200
      })
    });

    const latency_ms = Date.now() - start;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI request failed: ${res.status} ${text}`);
    }

    const payload = await res.json();
    const usage = normalizeUsage(payload);
    const content = extractContent(payload);
    const pricingProvider = getPricingProvider();
    const modelName = payload?.model ?? request.model;
    const estimated_cost = pricingProvider.estimateCost(modelName, usage);

    return {
      content,
      model_name: modelName,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms,
      estimated_cost,
      raw: payload
    };
  }
};