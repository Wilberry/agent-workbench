export type LLMToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LLMToolChoice = 'auto' | 'none' | 'required';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
  is_error?: boolean;
};

export type LLMRequest = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  provider?: string;
  timeout_ms?: number;
  max_retries?: number;
  tools?: LLMToolDefinition[];
  tool_choice?: LLMToolChoice;
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
  tool_calls?: LLMToolCall[];
  stop_reason?: 'stop' | 'tool_use' | 'max_tokens' | 'content_filter' | string;
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
