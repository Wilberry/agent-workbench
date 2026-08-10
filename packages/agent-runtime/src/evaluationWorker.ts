import {
  dequeueEvaluationRun,
  processEvaluationRunJob,
  reclaimStaleEvaluationJobs
} from './evaluationQueue';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process at most one queued evaluation run. Useful for scheduled/container workers. */
export async function processNextEvaluationRun(): Promise<boolean> {
  const job = await dequeueEvaluationRun();
  if (!job) {
    await reclaimStaleEvaluationJobs().catch(() => {});
    return false;
  }

  await processEvaluationRunJob(job);
  return true;
}

/**
 * Run a dedicated evaluation worker loop. Production deployments can run this
 * alongside the existing agent worker in the same container or separately.
 */
export async function startEvaluationWorker(): Promise<void> {
  const worker = async () => {
    while (true) {
      try {
        const processed = await processNextEvaluationRun();
        if (!processed) await sleep(1000);
      } catch (error) {
        console.error('Evaluation background worker error:', error);
        await sleep(5000);
      }
    }
  };

  void worker();
}
