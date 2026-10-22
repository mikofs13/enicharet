export class AuctionError extends Error {
  constructor(message: string, public readonly status = 400, public readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

const MAX_INT = 2147483647;

export function parseMoney(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return amount > 0 && amount <= MAX_INT ? amount : null;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function validateAuction(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AuctionError("Enter the auction details.");
  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (title.length < 3 || title.length > 120) fields.title = "Use a title between 3 and 120 characters.";
  if (description.length < 20 || description.length > 5000) fields.description = "Use a description between 20 and 5,000 characters.";
  const entryFeeMinor = parseMoney(body.entryFee);
  if (entryFeeMinor === null) fields.entryFee = "Enter a positive fee with no more than two decimal places.";
  const limitText = body.maxBidsPerUser;
  const maxBidsPerUser = limitText === "" || limitText === null ? null :
    typeof limitText === "string" && /^[1-9]\d{0,9}$/.test(limitText) && Number(limitText) <= MAX_INT ? Number(limitText) : undefined;
  if (maxBidsPerUser === undefined) fields.maxBidsPerUser = "Enter a positive whole number, or leave blank for unlimited.";
  const hours = typeof body.paymentWindowHours === "string" && /^[1-9]\d{0,2}$/.test(body.paymentWindowHours) ? Number(body.paymentWindowHours) : 0;
  if (hours < 1 || hours > 720) fields.paymentWindowHours = "Choose between 1 and 720 hours.";
  const opensAt = dateValue(body.opensAt);
  const closesAt = dateValue(body.closesAt);
  if (!opensAt) fields.opensAt = "Choose a valid opening time.";
  if (!closesAt || (opensAt && closesAt <= opensAt)) fields.closesAt = "Closing time must be after opening time.";

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const imageAlt = typeof body.imageAlt === "string" ? body.imageAlt.trim() : "";
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== "https:" || url.username || url.password || imageUrl.length > 2000) throw new Error();
    } catch { fields.imageUrl = "Enter a public HTTPS image URL without embedded credentials."; }
    if (imageAlt.length < 3 || imageAlt.length > 200) fields.imageAlt = "Describe the image in 3 to 200 characters.";
  }
  if (Object.keys(fields).length) throw new AuctionError("Check the highlighted fields.", 400, fields);
  return {
    title, description, entryFeeMinor: entryFeeMinor!, maxBidsPerUser: maxBidsPerUser ?? null,
    paymentWindowSeconds: hours * 3600, opensAt: opensAt!, closesAt: closesAt!, imageUrl, imageAlt,
  };
}

export function requireRevision(input: unknown): string {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>).updatedAt : undefined;
  if (typeof value !== "string" || !dateValue(value)) throw new AuctionError("Reload the auction before saving changes.", 409);
  return new Date(value).toISOString();
}
