const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const USE_MOCK_OPENAI = process.env.USE_MOCK_OPENAI === 'true' || !OPENAI_API_KEY;
const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';

export async function generateEmbedding(text: string): Promise<number[]> {
  if (USE_MOCK_OPENAI) {
    return new Array(1536).fill(0);
  }

  const response = await fetch(OPENAI_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error('Invalid embedding response from OpenAI');
  }

  return embedding;
}
