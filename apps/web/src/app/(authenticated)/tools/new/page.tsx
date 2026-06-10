import ToolForm from '@/components/ToolForm';

export default function NewToolPage() {
  return (
    <main className="p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Create Tool</h1>
        <div className="mt-4 rounded border border-slate-700 bg-slate-900 p-6">
          <ToolForm />
        </div>
      </div>
    </main>
  );
}
