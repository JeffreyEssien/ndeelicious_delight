type Stockist = { name: string; city: string; url: string; address?: string; phone?: string };

// "strip" lays the stores out as one hairline-divided panel, used inside the
// homepage ready-to-bake band; "grid" is the standalone card grid.
export function Stockists({ stockists, variant = "grid" }: { stockists: Stockist[]; variant?: "grid" | "strip" }) {
  return (
    <div className={variant === "strip" ? "stockist-strip" : "stockist-grid"}>
      {stockists.map((store, index) => (
        <article className="stockist-card" key={store.name}>
          {variant === "strip" && <span className="stockist-index">{String(index + 1).padStart(2, "0")}</span>}
          <h3>{store.name}</h3>
          <p className="stockist-address">{store.address || store.city}</p>
          <div className="stockist-links">
            {store.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                Get directions ↗
              </a>
            )}
            {store.phone && <a href={`tel:${store.phone.replace(/[^0-9+]/g, "")}`}>{store.phone}</a>}
            {store.url && (
              <a href={store.url} target="_blank" rel="noreferrer">
                Website ↗
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
