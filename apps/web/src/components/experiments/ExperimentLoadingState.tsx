'use client';

export default function ExperimentLoadingState() {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-2xl bg-slate-800 animate-pulse"></div>
          <div className="h-4 w-96 rounded-2xl bg-slate-800 animate-pulse"></div>
        </div>

        {/* Metrics skeleton */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
              <div className="h-3 w-20 rounded bg-slate-800 animate-pulse"></div>
              <div className="mt-3 h-8 w-16 rounded bg-slate-800 animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid grid-cols-5 gap-4 border-b border-slate-700 px-6 py-4">
              <div className="col-span-2 space-y-2">
                <div className="h-4 w-32 rounded bg-slate-800 animate-pulse"></div>
                <div className="h-3 w-24 rounded bg-slate-800 animate-pulse"></div>
              </div>
              <div className="h-4 w-16 rounded bg-slate-800 animate-pulse"></div>
              <div className="h-4 w-16 rounded bg-slate-800 animate-pulse"></div>
              <div className="h-4 w-16 rounded bg-slate-800 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
