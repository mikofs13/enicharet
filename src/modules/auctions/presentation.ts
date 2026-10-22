export function money(amountMinor: number) {
  return `${new Intl.NumberFormat("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountMinor / 100)} birr`;
}

export function auctionPhase(auction: { status: string; opensAt: Date | string; closesAt: Date | string }, now = new Date()) {
  if (auction.status === "DRAFT") return "Draft";
  if (auction.status === "CANCELLED") return "Cancelled";
  if (["WINNER_CONFIRMED", "FULFILLED"].includes(auction.status)) return "Awarded";
  if (new Date(auction.closesAt) <= now) return "Closed";
  if (new Date(auction.opensAt) > now) return "Upcoming";
  return "Open";
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function toEthiopianInput(value: string) {
  return new Date(new Date(value).getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}

export function fromEthiopianInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+03:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return toEthiopianInput(iso) === value ? iso : null;
}
