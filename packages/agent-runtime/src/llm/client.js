import { openaiProvider } from './providers/openai';
import { mockProvider } from './providers/mock';
const providers = {
    openai: openaiProvider,
    mock: mockProvider
};
function getProvider(provider) {
    const useMockOpenAI = process.env.USE_MOCK_OPENAI === 'true' || !process.env.OPENAI_API_KEY;
    if (useMockOpenAI) {
        return mockProvider;
    }
    const name = provider?.toLowerCase() ?? 'openai';
    return providers[name] ?? openaiProvider;
}
export async function chatCompletion(request) {
    const provider = getProvider(request.provider);
    return provider.chatCompletion(request);
}
