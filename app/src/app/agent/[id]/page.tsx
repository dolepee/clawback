export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Agent #{id}</h1>
      <p className="text-neutral-400">Reputation, claim history, accuracy.</p>
    </div>
  );
}
