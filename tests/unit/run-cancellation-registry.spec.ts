import { describe, expect, it } from 'vitest';
import {
  abortActiveRun,
  registerActiveRun
} from '@agent-workbench/agent-runtime';

describe('active agent run cancellation registry', () => {
  it('aborts the controller registered for a run and unregisters cleanly', () => {
    const controller = new AbortController();
    const unregister = registerActiveRun('run-registry-test', controller);

    expect(abortActiveRun('run-registry-test', 'cancel from route')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('cancel from route');

    unregister();
    expect(abortActiveRun('run-registry-test', 'should not find controller')).toBe(false);
  });
});
