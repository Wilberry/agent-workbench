'use client';

import Link from 'next/link';

type MarketplaceItem = {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
};

export default function MarketplaceList({ items }: { items: MarketplaceItem[] }) {
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
          No marketplace agents found.
        </div>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/marketplace/${item.id}`}
            className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-500 hover:bg-slate-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                <p className="text-sm text-slate-400">{item.description ?? 'No description provided.'}</p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-widest text-slate-300">
                {item.visibility}
              </span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
