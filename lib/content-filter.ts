// Blocks chat messages that try to move the conversation off-platform
// (Instagram/Twitter DMs, phone numbers, email) — a shop and customer
// meeting off-platform means the order (and the platform's 5% fee) never
// happens here. This is necessarily a blunt, regex-based heuristic: it will
// have false positives (e.g. a price that looks like a phone number) and
// false negatives (creatively obfuscated contact info). See README "Known
// simplifications".

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const HANDLE_PATTERN = /(^|\s)@[a-z0-9_.]{2,30}/i;
const SOCIAL_KEYWORD_PATTERN =
  /\b(instagram|insta\b|ig[:\s]|twitter|tiktok|whatsapp|wechat|line\s*id|telegram|snapchat|facebook|messenger|discord)\b/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// At least 7 digits total, allowing common separators between them —
// loose on purpose (international formats vary), tightened by requiring a
// run of digit-heavy tokens rather than any 7 digits scattered in prose.
const PHONE_PATTERN = /(\+?\d[\d\-.\s]{6,}\d)/;

export interface ContentFilterResult {
  blocked: boolean;
  reason?: string;
}

export function checkForExternalContactInfo(text: string): ContentFilterResult {
  if (URL_PATTERN.test(text) || HANDLE_PATTERN.test(text)) {
    return { blocked: true, reason: "links or @handles" };
  }
  if (SOCIAL_KEYWORD_PATTERN.test(text)) {
    return { blocked: true, reason: "mentions of other messaging apps" };
  }
  if (EMAIL_PATTERN.test(text)) {
    return { blocked: true, reason: "email addresses" };
  }
  if (PHONE_PATTERN.test(text)) {
    return { blocked: true, reason: "phone numbers" };
  }
  return { blocked: false };
}
