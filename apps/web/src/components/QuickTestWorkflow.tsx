'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AgentVersion } from '@agent-workbench/sdk';

interface QuickTestWorkflowProps {
  agentId: string;
  conversationId: string;
  versions: AgentVersion[];
}

interface TestResult {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
}

export default function QuickTestWorkflow({ agentId, conversationId, versions }: QuickTestWorkflowProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string>(versions[0]?.id ?? '');
  const [testPrompt, setTestPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);

  const handleRunTest = async () => {
    if (!testPrompt.trim() || !selectedVersionId) {
      setError('Please select a version and enter a test prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      // Submit test run with selected version
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          conversationId,
          message: testPrompt,
          agentVersionId: selectedVersionId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create test run');
      }

      const { runId, status } = await response.json();

      setTestResult({
        runId,
        status: status || 'pending',
        message: 'Test run created and queued for execution.'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run test');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <h3 className="mb-4 text-lg font-semibold text-slate-100">Quick Test Workflow</h3>
      <p className="mb-6 text-sm text-slate-400">
        Test any version with a prompt to see how it responds in real time.
      </p>

      <div className="space-y-4">
        {/* Version selector */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Select Version</label>
          <select
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {versions.length === 0 ? (
              <option>No versions available</option>
            ) : (
              versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version} (v{v.version_number}) - {v.model}
                </option>
              ))
            )}
          </select>
          {selectedVersion && (
            <div className="mt-2 text-xs text-slate-400">
              <span className="text-slate-300">Model:</span> {selectedVersion.model}
              {selectedVersion.workflow && selectedVersion.workflow.length > 0 && (
                <>
                  <br />
                  <span className="text-slate-300">Workflow:</span> {selectedVersion.workflow.join(' → ')}
                </>
              )}
            </div>
          )}
        </div>

        {/* Prompt input */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Test Prompt</label>
          <textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="Enter a test prompt to send to the agent..."
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 disabled:opacity-50"
            rows={4}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/30 p-3">
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-emerald-200">Test Run Created</div>
                <div className="text-xs text-emerald-300">Status: {testResult.status}</div>
                <div className="text-xs text-emerald-400 mt-1">{testResult.message}</div>
              </div>
              <Link
                href={`/runs/${testResult.runId}`}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                View Run →
              </Link>
            </div>
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRunTest}
          disabled={isLoading || !selectedVersionId || !testPrompt.trim()}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Running test...' : 'Run Quick Test'}
        </button>
      </div>
    </div>
  );
}
