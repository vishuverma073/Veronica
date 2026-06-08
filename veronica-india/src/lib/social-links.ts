/**
 * Optional storefront social profile URLs. Icons are hidden when a URL is not
 * configured — avoids dead `#` links in the footer.
 */
export type SocialLink = {
  label: "Instagram" | "Facebook" | "YouTube";
  href: string;
};

function readUrl(key: string): string | undefined {
  const raw = process.env[key]?.trim();
  if (!raw || raw === "#") return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Social links with valid http(s) URLs only. */
export function getSocialLinks(): SocialLink[] {
  const links: SocialLink[] = [];
  const instagram = readUrl("NEXT_PUBLIC_SOCIAL_INSTAGRAM");
  const facebook = readUrl("NEXT_PUBLIC_SOCIAL_FACEBOOK");
  const youtube = readUrl("NEXT_PUBLIC_SOCIAL_YOUTUBE");
  if (instagram) links.push({ label: "Instagram", href: instagram });
  if (facebook) links.push({ label: "Facebook", href: facebook });
  if (youtube) links.push({ label: "YouTube", href: youtube });
  return links;
}
