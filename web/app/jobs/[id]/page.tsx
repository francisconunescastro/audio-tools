export default function Placeholder({ params }: { params: { id: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Job created</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Processing UI lands in Phase 3. Job ID:
        </p>
        <code className="block px-3 py-2 rounded bg-neutral-100 dark:bg-neutral-900 font-mono text-xs">
          {params.id}
        </code>
      </div>
    </main>
  );
}
