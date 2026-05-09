export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Claim #{id}</h1>
      <p className="text-neutral-400">Claim detail view. Pre unlock, post unlock, post settlement.</p>
    </div>
  );
}
