"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/types";

export function ProductGallery({ product }: { product: Product }) {
  const images = product.images?.length
    ? product.images
    : [{ id: `${product.id}-primary`, url: product.image, altText: product.name, sortOrder: 0 }];
  const [selectedId, setSelectedId] = useState(images[0]?.id ?? "");
  const selected = images.find((image) => image.id === selectedId) ?? images[0];
  if (!selected) return null;

  return (
    <div className="gallery">
      <div className="gallery-main">
        <Image
          src={selected.url}
          alt={selected.altText}
          fill
          priority
          sizes="(max-width:800px) 100vw, 55vw"
          style={{ objectPosition: product.imagePosition }}
        />
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((image) => (
            <button
              type="button"
              className={image.id === selected.id ? "active" : ""}
              aria-pressed={image.id === selected.id}
              onClick={() => setSelectedId(image.id)}
              key={image.id}
            >
              <Image src={image.url} alt={image.altText} fill sizes="100px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
