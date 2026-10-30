"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";

export type KitchenPhoto = {
  id: string;
  url: string;
  alt: string;
  name: string;
  slug: string;
  position?: string;
  type: string;
  typeLabel: string;
};
export type KitchenFilter = { type: string; label: string; href: string; linkLabel: string };

const PER_VIEW = 5;

// "All" takes one bake from each type in turn, so every kind of product gets a spot and the
// first type (Ready to order) leads in the big tile.
function mixed(photos: KitchenPhoto[], filters: KitchenFilter[]) {
  const queues = filters.map((filter) => photos.filter((photo) => photo.type === filter.type));
  const result: KitchenPhoto[] = [];
  while (result.length < PER_VIEW && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && result.length < PER_VIEW) result.push(next);
    }
  }
  return result;
}

export function KitchenGallery({
  photos,
  filters,
  allLabel,
  allHref,
  allLinkLabel,
}: {
  photos: KitchenPhoto[];
  filters: KitchenFilter[];
  allLabel: string;
  allHref: string;
  allLinkLabel: string;
}) {
  const [active, setActive] = useState("ALL");
  const filter = filters.find((item) => item.type === active);
  const shown = filter ? photos.filter((photo) => photo.type === active).slice(0, PER_VIEW) : mixed(photos, filters);
  const chips = [{ type: "ALL", label: allLabel }, ...filters];
  return (
    <>
      {filters.length > 1 && (
        <div className="kitchen-filters">
          {chips.map((chip) => (
            <button
              type="button"
              key={chip.type}
              aria-pressed={active === chip.type}
              onClick={() => setActive(chip.type)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <div className="kitchen-gallery" data-count={shown.length} key={active}>
        {shown.map((item, index) => (
          <Link className="kitchen-tile" href={`/product/${item.slug}`} key={item.id}>
            <Image
              src={item.url}
              alt={item.alt}
              fill
              sizes={index === 0 ? "(max-width:800px) 100vw, 50vw" : "(max-width:800px) 50vw, 25vw"}
              style={item.position ? { objectPosition: item.position } : undefined}
            />
            {!filter && <span className="kitchen-type">{item.typeLabel}</span>}
            <span className="kitchen-caption">
              {item.name} <Icon name="arrow" />
            </span>
          </Link>
        ))}
      </div>
      <Link className="inline-link kitchen-more" href={filter?.href ?? allHref}>
        {filter?.linkLabel ?? allLinkLabel} <Icon name="arrow" />
      </Link>
    </>
  );
}
