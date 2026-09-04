/** A titled block on Today: a 20px heading, then whatever it holds. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-section font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
