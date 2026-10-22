import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// Accept Ethiopian local input, or an explicit international country code.
// Every authentication request and stored account uses the same E.164 value.
export function normalizePhoneNumber(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const value = input.trim();
  if (!/^[+\d\s().-]+$/.test(value)) return null;
  try {
    const phone = parsePhoneNumberFromString(value, "ET");
    return phone?.isValid() ? phone.number : null;
  } catch {
    return null;
  }
}
