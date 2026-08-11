import { pathToFileURL } from 'node:url';

function normalizeDeploymentBaseUrl(value) {
  const candidate = value?.trim();
  if (!candidate) {
    throw new Error('DEPLOYMENT_BASE_URL is required');
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('DEPLOYMENT_BASE_URL must be an absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('DEPLOYMENT_BASE_URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('DEPLOYMENT_BASE_URL must not include URL credentials');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('DEPLOYMENT_BASE_URL must be an origin without a path, query, or fragment');
  }

  return parsed.origin;
}

function normalizeProtectionBypassSecret(value) {
  const candidate = value?.trim();
  return candidate || undefined;
}

async function fetchHealth(fetchImpl, url, expectedStatus, timeoutMs, protectionBypassSecret) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const pathname = new URL(url).pathname;

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(protectionBypassSecret
            ? { 'x-vercel-protection-bypass': protectionBypassSecret }
            : {})
        },
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Health check timed out after ${timeoutMs}ms: ${pathname}`);
      }
      throw error;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status !== expectedStatus) {
      throw new Error(`Health check failed with status ${response.status}: ${pathname}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function smokeDeployment({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  protectionBypassSecret
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const origin = normalizeDeploymentBaseUrl(baseUrl);
  const bypassSecret = normalizeProtectionBypassSecret(protectionBypassSecret);
  const live = await fetchHealth(
    fetchImpl,
    `${origin}/api/health/live`,
    200,
    timeoutMs,
    bypassSecret
  );
  if (!live || live.status !== 'ok') {
    throw new Error('Liveness response is invalid');
  }

  const ready = await fetchHealth(
    fetchImpl,
    `${origin}/api/health/ready`,
    200,
    timeoutMs,
    bypassSecret
  );
  if (!ready || ready.status !== 'ready') {
    throw new Error('Readiness response is invalid');
  }

  return { live, ready };
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.DEPLOYMENT_BASE_URL;
  await smokeDeployment({
    baseUrl,
    protectionBypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  });
  process.stdout.write('Deployment health smoke check passed\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Deployment health smoke check failed: ${message}\n`);
    process.exitCode = 1;
  });
}
