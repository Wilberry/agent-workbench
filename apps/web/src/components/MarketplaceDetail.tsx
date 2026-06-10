'use client';

export default function MarketplaceDetail({ name, description, visibility }: { name: string; description?: string | null; visibility: string }) {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="text-2xl font-semibold text-white">{name}</h2>
      <p className="mt-3 text-slate-400">{description ?? 'No description provided.'}</p>
      <div className="mt-4 inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-widest text-slate-300">
        Visibility: {visibility}
      </div>
    </div>
  );
}
