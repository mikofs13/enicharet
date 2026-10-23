import "server-only";

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { AuctionError, requireRevision, validateAuction } from "./validation";

const images = { orderBy: { position: "asc" as const } };
const publicStatuses = ["SCHEDULED", "OPEN", "CLOSING", "AWAITING_PAYMENT", "WINNER_CONFIRMED", "REFUNDING", "FULFILLED", "REFUNDED"] as const;

export async function listAuctions(page: number, admin = false) {
  const db = getPrisma();
  const where = admin ? {} : { status: { in: [...publicStatuses] } };
  const [items, total] = await db.$transaction([
    db.auction.findMany({ where, include: { images }, orderBy: [{ opensAt: "desc" }, { id: "asc" }], take: 12, skip: (page - 1) * 12 }),
    db.auction.count({ where }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 12) };
}

export async function getPublicAuction(slug: string) {
  return getPrisma().auction.findFirst({ where: { slug, status: { in: [...publicStatuses] } }, include: { images } });
}

export async function getAdminAuction(id: string) {
  return getPrisma().auction.findUnique({ where: { id }, include: { images } });
}

export async function createAuction(input: unknown) {
  const { imageUrl, imageAlt, ...data } = validateAuction(input);
  const base = data.title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 65) || "prize";
  return getPrisma().auction.create({
    data: { ...data, slug: `${base}-${randomUUID()}`, status: "DRAFT",
      images: imageUrl ? { create: [{ url: imageUrl, alt: imageAlt, position: 0 }] } : undefined },
    include: { images },
  });
}

export async function updateAuction(id: string, input: unknown) {
  const revision = requireRevision(input);
  const { imageUrl, imageAlt, ...data } = validateAuction(input);
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.auction.findUnique({ where: { id } });
    if (!current) throw new AuctionError("Auction not found.", 404);
    if (current.status !== "DRAFT") throw new AuctionError("Published auctions are locked.", 409);
    if (current.updatedAt.toISOString() !== revision) throw new AuctionError("Another change was saved. Reload before editing.", 409);
    await tx.auctionImage.deleteMany({ where: { auctionId: id } });
    return tx.auction.update({ where: { id }, data: { ...data,
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      images: imageUrl ? { create: [{ url: imageUrl, alt: imageAlt, position: 0 }] } : undefined,
    }, include: { images } });
  });
}

export async function publishAuction(id: string, input: unknown) {
  const revision = requireRevision(input);
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.auction.findUnique({ where: { id } });
    if (!current) throw new AuctionError("Auction not found.", 404);
    if (current.status !== "DRAFT") throw new AuctionError("This auction is already published.", 409);
    if (current.updatedAt.toISOString() !== revision) throw new AuctionError("The auction changed. Reload and review it before publishing.", 409);
    if (current.opensAt <= new Date()) throw new AuctionError("Choose a future opening time before publishing.", 400, { opensAt: "Opening time must be in the future." });
    return tx.auction.update({ where: { id }, data: { status: "SCHEDULED" }, include: { images } });
  });
}
