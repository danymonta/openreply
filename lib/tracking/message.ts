export interface MessageTrackedLink {
  slug: string;
  destinationUrl: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/i;

function trimTrailingPunctuation(url: string) {
  return url.replace(/[.,!?;:]+$/, "");
}

export function extractFirstUrl(message: string): string | null {
  const match = message.match(URL_PATTERN);
  if (!match) return null;

  try {
    const url = trimTrailingPunctuation(match[0]);
    return new URL(url).toString();
  } catch {
    return null;
  }
}

export function replaceUrlWithTrackedPlaceholder(
  message: string,
  destinationUrl: string | null | undefined
) {
  if (!destinationUrl) return message;
  if (message.includes(destinationUrl)) {
    return message.replace(destinationUrl, "{link}");
  }

  const withoutTrailingSlash = destinationUrl.replace(/\/$/, "");
  return message.replace(withoutTrailingSlash, "{link}");
}

// {nome}, {name} and {first_name} all insert the recipient's first name.
const NAME_TOKEN = /\{(?:nome|name|first_name)\}/gi;

/** True when a message uses a first-name token, so the name is worth fetching. */
export function hasNameToken(message: string | null | undefined): boolean {
  return Boolean(message) && new RegExp(NAME_TOKEN.source, "i").test(message as string);
}

/**
 * Fill {username} and the first-name tokens. A first name falls back to the
 * username, because Instagram only returns a profile name for some users.
 */
function personalize(
  message: string,
  commenterName: string | null | undefined,
  firstName: string | null | undefined
) {
  return message
    .replace(/\{username\}/gi, commenterName ?? "there")
    .replace(NAME_TOKEN, firstName || commenterName || "");
}

/**
 * Personalize {username} / {nome} and strip the {link} token — used when the
 * link is delivered as a separate button rather than inline in the message text.
 */
export function renderMessageWithoutLink({
  message,
  commenterName,
  firstName,
}: {
  message: string;
  commenterName?: string | null;
  firstName?: string | null;
}) {
  return personalize(message, commenterName, firstName)
    .replace(/\s*\{link\}\s*/gi, " ")
    .trim();
}

export function buildTrackedUrl(
  slug: string,
  baseUrl?: string,
  recipientToken?: string
) {
  const resolvedBaseUrl =
    baseUrl ??
    (typeof window !== "undefined"
      ? window.location.origin
      : process.env.LINK_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000");

  const url = `${resolvedBaseUrl.replace(/\/$/, "")}/r/${slug}`;
  return recipientToken ? `${url}?r=${recipientToken}` : url;
}

export function renderMessageWithTracking({
  message,
  commenterName,
  firstName,
  trackedLinks,
  baseUrl,
  recipientToken,
}: {
  message: string;
  commenterName?: string | null;
  firstName?: string | null;
  trackedLinks?: MessageTrackedLink[];
  baseUrl?: string;
  recipientToken?: string;
}) {
  let rendered = personalize(message, commenterName, firstName);
  const primaryLink = trackedLinks?.[0];

  if (!primaryLink) return rendered;

  const trackedUrl = buildTrackedUrl(primaryLink.slug, baseUrl, recipientToken);

  if (/\{link\}/i.test(rendered)) {
    return rendered.replace(/\{link\}/gi, trackedUrl);
  }

  if (rendered.includes(primaryLink.destinationUrl)) {
    rendered = rendered.replaceAll(primaryLink.destinationUrl, trackedUrl);
  } else {
    const withoutTrailingSlash = primaryLink.destinationUrl.replace(/\/$/, "");
    rendered = rendered.replaceAll(withoutTrailingSlash, trackedUrl);
  }

  return rendered;
}
