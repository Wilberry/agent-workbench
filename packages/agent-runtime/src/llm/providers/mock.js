export const mockProvider = {
    name: 'mock',
    async chatCompletion(request) {
        const userContent = request.messages
            .filter((message) => message.role === 'user')
            .map((message) => message.content)
            .join('\n')
            .trim();
        const content = userContent
            ? `Mock response: ${userContent.slice(0, 180)}`
            : 'Mock response from the test provider.';
        const promptTokens = Math.max(1, Math.ceil(content.length / 20));
        const completionTokens = 1;
        const totalTokens = promptTokens + completionTokens;
        return {
            content,
            model_name: request.model ?? 'gpt-4o-mini',
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            latency_ms: 1,
            estimated_cost: 0,
            raw: { mock: true }
        };
    }
};
