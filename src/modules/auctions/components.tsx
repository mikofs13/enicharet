import Image from "next/image";
import Link from "next/link";
import { PrizeArt, prizeKind } from "@/components/prize-art";

export function PrizeImage({ image, title = "", priority = false }: { image?: { url: string; alt: string }; title?: string; priority?: boolean }) {
  return <div className="prize-image">{image ? <Image src={image.url} alt={image.alt} fill unoptimized sizes="(max-width: 740px) 100vw, (max-width: 1100px) 50vw, 33vw" preload={priority} /> : <PrizeArt kind={prizeKind(title)} />}</div>;
}

export function Pagination({ page, pages, base }: { page: number; pages: number; base: string }) {
  return pages > 1 ? <nav className="pagination" aria-label="Prize pages">{page > 1 && <Link className="text-link" href={`${base}?page=${page - 1}`}>← Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="text-link" href={`${base}?page=${page + 1}`}>Next →</Link>}</nav> : null;
}
