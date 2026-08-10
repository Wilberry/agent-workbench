export type LLMMessage = {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
};

export type LLMRequest = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  provider?: string;
};

export type LLMUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type LLMResponse = {
  content: string;
  provider_name?: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost: number;
  raw?: unknown;
};

export type LLMProvider = {
  name: string;
  chatCompletion(request: LLMRequest): Promise<LLMResponse>;
};

export type ModelPricing = {
  provider?: string;
  model: string;
  currency: 'USD';
  promptPer1k: number;
  completionPer1k: number;
  aliases?: string[];
  catalogVersion?: string;
};

export type PricingProvider = {
  getModelPricing(model: string, provider?: string): ModelPricing | null;
  estimateCost(model: string, usage: LLMUsage, provider?: string): number;
};
