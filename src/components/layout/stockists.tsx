type Stockist = { name: string; city: string; url: string; address?: string; phone?: string };

export function Stockists({ stockists }: { stockists: Stockist[] }) {
  return (
    <div className="stockist-grid">
      {stockists.map((store) => (
        <article className="stockist-card" key={store.name}>
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
