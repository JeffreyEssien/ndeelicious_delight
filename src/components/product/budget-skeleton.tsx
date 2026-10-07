export function BudgetResultsSkeleton() {
  return (
    <section className="budget-match-results" aria-label="Loading bakery options" aria-busy="true">
      <div className="budget-skeleton-line" />
      <p role="status">Finding your bakery options…</p>
      <div className="budget-match-grid">
        {[0, 1, 2].map((index) => (
          <article className="budget-match-skeleton" key={index} aria-hidden="true">
            <div className="budget-match-photo" />
            <div className="budget-match-info">
              <div className="budget-skeleton-line" />
              <div className="budget-skeleton-line short" />
              <div className="budget-skeleton-line" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
