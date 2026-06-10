'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  initial?: any;
  onSave?: (tool: any) => void;
};

export default function ToolForm({ initial = {}, onSave }: Props) {
  const [name, setName] = useState(initial.name || '');
  const [slug, setSlug] = useState(initial.slug || '');
  const [entrypoint, setEntrypoint] = useState(initial.entrypoint || '');
  const [description, setDescription] = useState(initial.description || '');
  const [isPublic, setIsPublic] = useState(!!initial.public);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name,
      slug,
      entrypoint,
      description,
      public: isPublic
    };

    const res = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      onSave?.(data.tool);
      router.push('/tools');
    } else {
      const text = await res.text();
      alert('Failed to create tool: ' + text);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-semibold">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-semibold">Slug</label>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-semibold">Entrypoint</label>
        <input value={entrypoint} onChange={(e) => setEntrypoint(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-semibold">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div className="flex items-center gap-3">
        <input id="public" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <label htmlFor="public" className="text-sm">Public</label>
      </div>

      <div>
        <button type="submit" className="rounded bg-emerald-500 px-4 py-2 text-black">Save</button>
      </div>
    </form>
  );
}
