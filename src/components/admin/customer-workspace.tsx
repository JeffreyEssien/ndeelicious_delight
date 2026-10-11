"use client";
import { useEffect, useState } from "react";
import { Button, Input, Select } from "@/components/ui/primitives";
import { useBusinessSettings } from "@/components/providers";
import { formatDate, formatMoney } from "@/lib/format";
type Customer = { name: string; email: string; orders: number; spent: number; last: string };
export function CustomerWorkspace() {
  const business = useBusinessSettings();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ q: "", page: 1, size: 25, revision: 0 });
  const [result, setResult] = useState<{ rows: Customer[]; total: number }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/admin/customers?q=${encodeURIComponent(filters.q)}&page=${filters.page}&size=${filters.size}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (!controller.signal.aborted) setResult(payload);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters]);
  return (
    <div className="admin-card customer-workspace">
      <form
        className="history-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, q: query, page: 1 }));
        }}
      >
        <Input label="Search all customers" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select
          label="Per page"
          value={filters.size}
          onChange={(event) => setFilters((current) => ({ ...current, size: Number(event.target.value), page: 1 }))}
        >
          {[25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </Select>
        <Button type="submit">Search</Button>
      </form>
      <p>Based on complete order history.</p>
      <details>
        <summary>How spending totals are calculated</summary>
        <p>Total spent excludes unpaid, failed, cancelled and fully refunded orders.</p>
      </details>
      {loading && <p role="status">Loading customers…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <Button onClick={() => setFilters((current) => ({ ...current, revision: current.revision + 1 }))}>
            Retry
          </Button>
        </p>
      )}
      {!loading && !error && (
        <>
          <div className="table-scroll mobile-card-table customers-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Orders</th>
                  <th>Total spent</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {result?.rows.map((customer) => (
                  <tr key={customer.email}>
                    <td>{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>{customer.orders}</td>
                    <td>{formatMoney(customer.spent, business.currency, business.locale)}</td>
                    <td>{formatDate(customer.last, business.locale, business.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {result?.total ?? 0} matching customers · Page {filters.page}
          </p>
          <div className="history-filter-actions">
            <Button
              variant="secondary"
              disabled={filters.page === 1}
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={filters.page * filters.size >= (result?.total ?? 0)}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
