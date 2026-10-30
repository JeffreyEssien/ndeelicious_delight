"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export type CakeCategoryTile = {
  id: string;
  name: string;
  href: string;
  detail: string;
  photos: { url: string; alt: string; position?: string }[];
};

// Each tile walks through its own cakes. Tiles start a beat apart so the grid never flips all at once.
function useRotation(count: number, offset: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        if (!document.hidden) setIndex((value) => (value + 1) % count);
      }, 4200);
    }, offset);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [count, offset]);
  return index;
}

function Tile({ tile, order }: { tile: CakeCategoryTile; order: number }) {
  const active = useRotation(tile.photos.length, 700 + order * 900);
  return (
    <Link href={tile.href} className="cake-cat">
      <div className="cake-cat-photo">
        {tile.photos.map((photo, index) => (
          <Image
            key={photo.url}
            src={photo.url}
            alt={index === active ? photo.alt : ""}
            aria-hidden={index !== active}
            className={index === active ? "is-shown" : undefined}
            style={photo.position ? { objectPosition: photo.position } : undefined}
            fill
            sizes={order === 0 ? "(max-width:700px) 100vw, 50vw" : "(max-width:700px) 50vw, 25vw"}
          />
        ))}
        {tile.photos.length > 1 && (
          <span className="cake-cat-dots" aria-hidden="true">
            {tile.photos.map((photo, index) => (
              <i key={photo.url} className={index === active ? "is-on" : undefined} />
            ))}
          </span>
        )}
      </div>
      <div className="cake-cat-label">
        <span>
          <b>{tile.name}</b>
          <small>{tile.detail}</small>
        </span>
        <Icon name="arrow" />
      </div>
    </Link>
  );
}

export function CakeCategories({ tiles }: { tiles: CakeCategoryTile[] }) {
  return (
    <div className={`cake-cats is-${Math.min(tiles.length, 5)}`}>
      {tiles.map((tile, index) => (
        <Tile key={tile.id} tile={tile} order={index} />
      ))}
    </div>
  );
}
