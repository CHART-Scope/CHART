/**
 * Typed client for the Learning Hub endpoints.
 *
 * Browsing is public: `listLearningResources`, `listLearningTracks` and
 * `listLearningTaxonomies` work without a token. The `/me` endpoints need a
 * session and carry the caller's pathway, progress and ranked picks.
 *
 * The catalogue is near-static seeded content, so the read endpoints opt out
 * of the usual `no-store` default and let the browser cache them.
 */

export type LearningKind =
  "video" | "course" | "article" | "report" | "toolkit" | string;

/** Only `embeddable` may be played inline; the rest are outbound links. */
export type EmbedStatus = "embeddable" | "open_unverified" | "restricted" | string;

export type LearningResource = {
  slug: string;
  url: string;
  canonical_url: string;
  youtube_id: string | null;
  kind: LearningKind;
  title: string;
  provider: string;
  objectives: string;
  audience_summary: string;
  location_label: string;
  countries: string[];
  languages: string[];
  /** `null` where the source sheet recorded no length. */
  duration_seconds: number | null;
  duration_label: string | null;
  format_label: string;
  published_on: string | null;
  access_label: string;
  embed_status: EmbedStatus;
  tracks: string[];
  tags: string[];
  health_outcomes: string[];
  /** Part of the hand-picked shortlist the hub opens with. */
  is_featured: boolean;
};

export type LearningTrack = {
  slug: string;
  title: string;
  summary: string;
  position: number;
  resource_count: number;
  completed_count: number;
};

export type TaxonomyTerm = {
  id: string;
  type:
    | "kind"
    | "track"
    | "language"
    | "country"
    | "health_outcome"
    | "tag"
    | "format"
    | string;
  label: string;
  count: number;
};

export type LearningProgress = {
  slug: string;
  seconds_watched: number;
  completed: boolean;
  last_seen_at: string;
};

export type LearningRecommendation = {
  item: LearningResource;
  /** Why this was picked, e.g. "Because you work in Kenya". */
  reason: string;
};

export type LearningPersonalView = {
  audience_id: string | null;
  interested_track_slugs: string[];
  tracks: LearningTrack[];
  progress: LearningProgress[];
  continue_watching: LearningRecommendation | null;
  recommendations: LearningRecommendation[];
};

export type LearningFilters = {
  tracks?: readonly string[];
  kinds?: readonly string[];
  languages?: readonly string[];
  countries?: readonly string[];
  outcomes?: readonly string[];
  maxMinutes?: number | null;
  /** `featured` (default) shows the shortlist; `all` shows the catalogue. */
  include?: "featured" | "all";
  search?: string;
  limit?: number;
};

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

async function readLearningError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "The Learning hub could not load.";
  } catch {
    return "The Learning hub could not load.";
  }
}

function toQuery(filters: LearningFilters): string {
  const params = new URLSearchParams();
  for (const value of filters.tracks ?? []) params.append("track", value);
  for (const value of filters.kinds ?? []) params.append("kind", value);
  for (const value of filters.languages ?? []) params.append("language", value);
  for (const value of filters.countries ?? []) params.append("country", value);
  for (const value of filters.outcomes ?? []) params.append("outcome", value);
  if (filters.maxMinutes) params.set("max_minutes", String(filters.maxMinutes));
  if (filters.search) params.set("search", filters.search);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.include) params.set("include", filters.include);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listLearningResources(
  filters: LearningFilters = {},
  signal?: AbortSignal,
): Promise<{ items: LearningResource[]; total: number }> {
  const response = await fetch(`/api/chart/learning/resources${toQuery(filters)}`, {
    signal,
  });
  if (!response.ok) throw new Error(await readLearningError(response));
  return (await response.json()) as { items: LearningResource[]; total: number };
}

export async function listLearningTracks(
  signal?: AbortSignal,
): Promise<LearningTrack[]> {
  const response = await fetch("/api/chart/learning/tracks", { signal });
  if (!response.ok) throw new Error(await readLearningError(response));
  const body = (await response.json()) as { tracks: LearningTrack[] };
  return body.tracks;
}

export async function listLearningTaxonomies(
  signal?: AbortSignal,
): Promise<TaxonomyTerm[]> {
  const response = await fetch("/api/chart/learning/taxonomies", { signal });
  if (!response.ok) throw new Error(await readLearningError(response));
  const body = (await response.json()) as { terms: TaxonomyTerm[] };
  return body.terms;
}

export async function fetchLearningPersonalView(
  accessToken: string,
  signal?: AbortSignal,
): Promise<LearningPersonalView> {
  const response = await fetch("/api/chart/learning/me", {
    cache: "no-store",
    headers: authHeaders(accessToken),
    signal,
  });
  if (!response.ok) throw new Error(await readLearningError(response));
  return (await response.json()) as LearningPersonalView;
}

export async function saveLearningPreferences(
  accessToken: string,
  preferences: { audienceId: string | null; interestedTrackSlugs: string[] },
): Promise<LearningPersonalView> {
  const response = await fetch("/api/chart/learning/me/preferences", {
    method: "PUT",
    cache: "no-store",
    headers: { "content-type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({
      audience_id: preferences.audienceId,
      interested_track_slugs: preferences.interestedTrackSlugs,
    }),
  });
  if (!response.ok) throw new Error(await readLearningError(response));
  return (await response.json()) as LearningPersonalView;
}

export async function saveLearningProgress(
  accessToken: string,
  progress: { slug: string; secondsWatched: number; completed?: boolean },
): Promise<LearningProgress> {
  const response = await fetch("/api/chart/learning/me/progress", {
    method: "PUT",
    cache: "no-store",
    headers: { "content-type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({
      slug: progress.slug,
      seconds_watched: progress.secondsWatched,
      completed: progress.completed ?? false,
    }),
  });
  if (!response.ok) throw new Error(await readLearningError(response));
  return (await response.json()) as LearningProgress;
}

/** YouTube's own thumbnail host; no API key and no next/image config needed. */
export function thumbnailUrl(resource: LearningResource): string | null {
  return resource.youtube_id
    ? `https://i.ytimg.com/vi/${resource.youtube_id}/hqdefault.jpg`
    : null;
}

/**
 * Privacy-preserving embed for any YouTube resource we are not told to leave
 * alone.
 *
 * `open_unverified` still plays: YouTube enforces the uploader's embed
 * setting itself, so a blocked video shows its own "Watch on YouTube" panel
 * rather than playing. Refusing to try just hides videos that work.
 */
export function embedUrl(resource: LearningResource): string | null {
  return resource.youtube_id && resource.embed_status !== "restricted"
    ? `https://www.youtube-nocookie.com/embed/${resource.youtube_id}?rel=0`
    : null;
}

/** Whether a card should offer a play affordance at all. */
export function isPlayable(resource: LearningResource): boolean {
  return embedUrl(resource) !== null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
