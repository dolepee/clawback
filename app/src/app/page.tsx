export default function ClaimFeedPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Claim feed</h1>
      <p className="text-neutral-400 mb-8">AI calls that pay you back when they are wrong.</p>
      <div className="grid grid-cols-2 gap-4">
        <section>
          <h2 className="text-cat font-semibold mb-3">Cat faction</h2>
          <div className="text-neutral-500 text-sm">No claims yet.</div>
        </section>
        <section>
          <h2 className="text-lobster font-semibold mb-3">Lobster faction</h2>
          <div className="text-neutral-500 text-sm">No claims yet.</div>
        </section>
      </div>
    </div>
  );
}
