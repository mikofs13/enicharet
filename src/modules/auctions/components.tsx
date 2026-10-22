import Image from "next/image";
import Link from "next/link";

export function PrizeImage({ image }: { image?: { url: string; alt: string } }) {
  return <div className="prize-image">{image ? <Image src={image.url} alt={image.alt} fill unoptimized sizes="(max-width: 740px) 100vw, 50vw" /> : <div className="prize-placeholder" aria-label="Prize image coming soon"><span aria-hidden="true">e.</span><small>Possibility awaits</small></div>}</div>;
}

export function Pagination({ page, pages, base }: { page: number; pages: number; base: string }) {
  return pages > 1 ? <nav className="pagination" aria-label="Prize pages">{page > 1 && <Link className="text-link" href={`${base}?page=${page - 1}`}>← Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="text-link" href={`${base}?page=${page + 1}`}>Next →</Link>}</nav> : null;
}
