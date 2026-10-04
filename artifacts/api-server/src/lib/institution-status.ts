import {
  checkAdditionalInstitutionStatus,
  getAdditionalInstitutionStatusSource,
} from "./institution-status-additional";
import {
  createInstitutionStatusResult,
  createUnableInstitutionStatusResult,
  normalizeText,
  type InstitutionStatusCheckInput,
  type InstitutionStatusInput,
  type InstitutionStatusResult,
  type InstitutionStatusSource,
} from "./institution-status-shared";
import { resolveInstitutionStatusInput } from "./institution-status-resolution";

type RegistryCategory = {
  name: string;
  url: string;
  expectedCount: number;
};

type RegistryRecord = {
  name: string;
  registryStatus: string | null;
  sourceUrl: string;
};

type RegistrySnapshot = {
  records: RegistryRecord[];
  fetchedAt: Date;
};

type RegistryLookup = {
  matchedRecord: RegistryRecord | null;
  snapshot: RegistrySnapshot | null;
  checkedAt: Date;
};

type FirstPageResult =
  | { category: RegistryCategory; pageCount: number; records: RegistryRecord[] }
  | { category: RegistryCategory; error: unknown };

const gtecOrigin = "https://gtec.edu.gh";
const gtecExploreUrl = `${gtecOrigin}/explore-institutions/`;
const gtecSourceName = "Ghana Tertiary Education Commission (GTEC) institution directory";
const ghanaCoverageLimits =
  "This check searches the public GTEC institutions-by-category directory for Ghana only. A missing exact name means only that no match was found in the fetched directory pages; it does not establish that an institution is unrecognized, fraudulent, or invalid. This check does not verify credential authenticity or affect academic mapping or admissions.";
const gtecSource: InstitutionStatusSource = {
  name: gtecSourceName,
  url: gtecExploreUrl,
  coverageLimits: ghanaCoverageLimits,
};
const cacheDurationMs = 6 * 60 * 60 * 1000;
const maxCategoryCount = 40;
const maxPagesPerCategory = 50;
const maxRegistryRecords = 5000;
const registryPageConcurrency = 8;

let registryCache: RegistrySnapshot | null = null;
const positiveRecordCache = new Map<string, { record: RegistryRecord; checkedAt: Date }>();
const pendingRegistryLookups = new Map<string, Promise<RegistryLookup>>();

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;|&#8217;|&rsquo;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : "";
    })
    .replace(/&#([0-9]+);/g, (_match, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : "";
    });
}

function textFromHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\b[^>]*>/gi, " ")
      .replace(/<\/(?:p|div|li|td|th|span|a|strong|em)>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstTableRows(html: string): string[][] {
  const table = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error("The GTEC directory page did not contain a table.");

  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cellMatch) => cellMatch[1]!),
  );
}

function safeInstitutionUrl(value: string): URL | null {
  try {
    const url = new URL(decodeHtmlEntities(value), gtecOrigin);
    const path = url.pathname.replace(/\/+$/, "");
    if (
      url.protocol !== "https:" ||
      url.origin !== gtecOrigin ||
      (path !== "/institutions" && !path.startsWith("/institutions/"))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function parseCategories(html: string): RegistryCategory[] {
  const rows = firstTableRows(html);
  const header = rows[0]?.map(textFromHtml) ?? [];
  const totalIndex = header.findIndex((value) => /total institutions/i.test(value));
  if (totalIndex < 0 || header.length < 2) {
    throw new Error("The GTEC category list had an unexpected structure.");
  }

  const categories: RegistryCategory[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const categoryCell = row[0];
    const totalCell = row[totalIndex];
    if (!categoryCell || !totalCell) {
      throw new Error("The GTEC category list contained an incomplete row.");
    }

    const href = categoryCell.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const url = href ? safeInstitutionUrl(href) : null;
    const name = textFromHtml(categoryCell);
    const expectedCount = Number.parseInt(textFromHtml(totalCell), 10);
    if (!url || !name || !Number.isInteger(expectedCount) || expectedCount < 0) {
      throw new Error("The GTEC category list contained an unreadable category.");
    }

    const categoryKey = url.searchParams.get("category") ?? "";
    if (!categoryKey || seen.has(categoryKey)) continue;
    seen.add(categoryKey);
    categories.push({ name, url: url.href, expectedCount });
  }

  if (
    categories.length === 0 ||
    categories.length > maxCategoryCount ||
    categories.reduce((total, category) => total + category.expectedCount, 0) >
      maxRegistryRecords
  ) {
    throw new Error("The GTEC category list was empty or outside supported limits.");
  }
  return categories;
}

function lastPageNumber(html: string, categoryUrl: string): number {
  const category = new URL(categoryUrl).searchParams.get("category");
  const decodedHtml = html.replace(/&amp;|&#0*38;/gi, "&");
  let lastPage = 1;

  for (const match of decodedHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1]!, gtecOrigin);
      const path = url.pathname.replace(/\/+$/, "");
      if (
        url.origin !== gtecOrigin ||
        (path !== "/institutions" && !path.startsWith("/institutions/")) ||
        url.searchParams.get("category") !== category
      ) {
        continue;
      }
      const page = Number.parseInt(url.searchParams.get("pg") ?? "1", 10);
      if (Number.isInteger(page)) lastPage = Math.max(lastPage, page);
    } catch {
      // Ignore non-URL pagination links. The category remains incomplete if its
      // advertised count cannot be reconciled with the pages we can read.
    }
  }

  return lastPage;
}

function parseInstitutionRows(html: string, sourceUrl: string): RegistryRecord[] {
  const rows = firstTableRows(html);
  const header = rows[0]?.map(textFromHtml) ?? [];
  const nameIndex = header.findIndex((value) => /^name$/i.test(value));
  const statusIndex = header.findIndex((value) => /^status$/i.test(value));
  if (nameIndex < 0 || statusIndex < 0) {
    throw new Error("The GTEC institution list had an unexpected table structure.");
  }

  const records: RegistryRecord[] = [];
  for (const row of rows.slice(1)) {
    const nameCell = row[nameIndex];
    const statusCell = row[statusIndex];
    if (nameCell === undefined || statusCell === undefined) {
      throw new Error("The GTEC institution list contained an incomplete row.");
    }

    const name = textFromHtml(nameCell);
    if (!name) throw new Error("The GTEC institution list contained an unnamed row.");
    records.push({
      name,
      registryStatus: textFromHtml(statusCell) || null,
      sourceUrl,
    });
  }
  return records;
}

async function fetchGtecHtml(
  url: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(12_000);
  const response = await fetcher(url, {
    headers: { Accept: "text/html" },
    signal: parentSignal
      ? AbortSignal.any([timeoutSignal, parentSignal])
      : timeoutSignal,
  });
  if (!response.ok) throw new Error(`GTEC returned HTTP ${response.status}.`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error("GTEC returned an unexpected content type.");
  }

  const html = await response.text();
  if (html.length === 0 || html.length > 2_000_000) {
    throw new Error("The GTEC directory response was empty or too large.");
  }
  return html;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function scanRegistryForName(
  normalizedName: string,
  fetcher: typeof fetch,
): Promise<RegistryLookup> {
  const indexHtml = await fetchGtecHtml(gtecExploreUrl, fetcher);
  const categories = parseCategories(indexHtml);
  const firstPageResults = await mapWithConcurrency(
    categories,
    registryPageConcurrency,
    async (category): Promise<FirstPageResult> => {
      try {
        const html = await fetchGtecHtml(category.url, fetcher);
        const pageCount = lastPageNumber(html, category.url);
        if (pageCount > maxPagesPerCategory) {
          throw new Error("A GTEC category exceeded the supported page limit.");
        }
        return {
          category,
          pageCount,
          records: parseInstitutionRows(html, category.url),
        };
      } catch (error) {
        return { category, error };
      }
    },
  );

  for (const result of firstPageResults) {
    if ("records" in result) {
      const matchedRecord = result.records.find(
        (record) => normalizeText(record.name) === normalizedName,
      );
      if (matchedRecord) {
        return { matchedRecord, snapshot: null, checkedAt: new Date() };
      }
    }
  }

  const firstPageError = firstPageResults.find(
    (result): result is Extract<FirstPageResult, { error: unknown }> =>
      "error" in result,
  )?.error;
  const successfulFirstPages = firstPageResults.filter(
    (result): result is Extract<FirstPageResult, { records: RegistryRecord[] }> =>
      "records" in result,
  );
  const recordsByCategory = new Map(
    successfulFirstPages.map((result) => [result.category.url, [...result.records]]),
  );
  const pageJobs = successfulFirstPages.flatMap((result) =>
    Array.from({ length: result.pageCount - 1 }, (_, index) => ({
      category: result.category,
      page: index + 2,
    })),
  );

  let matchedRecord: RegistryRecord | null = null;
  let pageError: unknown = null;
  let nextPageJob = 0;
  const pageAbortController = new AbortController();
  const pageWorker = async () => {
    while (matchedRecord === null && nextPageJob < pageJobs.length) {
      const job = pageJobs[nextPageJob]!;
      nextPageJob += 1;

      const pageUrl = new URL(job.category.url);
      pageUrl.searchParams.set("pg", String(job.page));
      try {
        const html = await fetchGtecHtml(
          pageUrl.href,
          fetcher,
          pageAbortController.signal,
        );
        const pageRecords = parseInstitutionRows(html, pageUrl.href);
        const pageMatch = pageRecords.find(
          (record) => normalizeText(record.name) === normalizedName,
        );
        if (pageMatch) {
          matchedRecord = pageMatch;
          pageAbortController.abort();
          return;
        }
        recordsByCategory.get(job.category.url)?.push(...pageRecords);
      } catch (error) {
        if (matchedRecord !== null || pageAbortController.signal.aborted) return;
        pageError ??= error;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(registryPageConcurrency, pageJobs.length) },
      () => pageWorker(),
    ),
  );

  if (matchedRecord) {
    return { matchedRecord, snapshot: null, checkedAt: new Date() };
  }
  if (firstPageError) throw firstPageError;
  if (pageError) throw pageError;

  for (const result of successfulFirstPages) {
    const categoryRecords = recordsByCategory.get(result.category.url) ?? [];
    if (categoryRecords.length !== result.category.expectedCount) {
      throw new Error(
        `The GTEC directory page count did not match the published total for ${result.category.name}.`,
      );
    }
  }

  const records = [...recordsByCategory.values()].flat();
  const expectedTotal = categories.reduce(
    (total, category) => total + category.expectedCount,
    0,
  );
  if (
    successfulFirstPages.length !== categories.length ||
    records.length !== expectedTotal
  ) {
    throw new Error("The GTEC directory could not be checked completely.");
  }
  const snapshot = { records, fetchedAt: new Date() };
  return { matchedRecord: null, snapshot, checkedAt: snapshot.fetchedAt };
}

async function getRegistryLookup(
  normalizedName: string,
  fetcher: typeof fetch,
): Promise<RegistryLookup> {
  if (fetcher !== globalThis.fetch) return scanRegistryForName(normalizedName, fetcher);

  const positiveRecord = positiveRecordCache.get(normalizedName);
  if (
    positiveRecord &&
    Date.now() - positiveRecord.checkedAt.getTime() < cacheDurationMs
  ) {
    return {
      matchedRecord: positiveRecord.record,
      snapshot: null,
      checkedAt: positiveRecord.checkedAt,
    };
  }
  if (positiveRecord) positiveRecordCache.delete(normalizedName);

  if (
    registryCache &&
    Date.now() - registryCache.fetchedAt.getTime() < cacheDurationMs
  ) {
    return {
      matchedRecord:
        registryCache.records.find(
          (record) => normalizeText(record.name) === normalizedName,
        ) ?? null,
      snapshot: registryCache,
      checkedAt: registryCache.fetchedAt,
    };
  }
  registryCache = null;

  let lookupPromise = pendingRegistryLookups.get(normalizedName);
  if (!lookupPromise) {
    lookupPromise = scanRegistryForName(normalizedName, fetcher);
    pendingRegistryLookups.set(normalizedName, lookupPromise);
  }

  try {
    const lookup = await lookupPromise;
    if (lookup.matchedRecord) {
      positiveRecordCache.set(normalizedName, {
        record: lookup.matchedRecord,
        checkedAt: lookup.checkedAt,
      });
      if (positiveRecordCache.size > 500) {
        for (const [key, entry] of positiveRecordCache) {
          if (Date.now() - entry.checkedAt.getTime() >= cacheDurationMs) {
            positiveRecordCache.delete(key);
          }
        }
      }
    } else if (lookup.snapshot) {
      registryCache = lookup.snapshot;
    }
    return lookup;
  } finally {
    pendingRegistryLookups.delete(normalizedName);
  }
}

function isGhana(value: string | null): boolean {
  if (!value?.trim()) return false;
  return ["ghana", "republic of ghana", "gh"].includes(normalizeText(value));
}

function unableResult(
  input: InstitutionStatusCheckInput,
  summary: string,
  checkedAt = new Date(),
  supportedGhana = false,
): InstitutionStatusResult {
  return createUnableInstitutionStatusResult(
    input,
    summary,
    input.identityReviewMessage
      ? null
      : supportedGhana
        ? gtecSource
        : getAdditionalInstitutionStatusSource(
            input.registryJurisdiction ?? input.jurisdiction,
          ),
    checkedAt,
  );
}

function isUnitedKingdom(value: string | null): boolean {
  if (!value?.trim()) return false;
  return [
    "united kingdom",
    "united kingdom of great britain and northern ireland",
    "great britain",
    "uk",
    "gb",
  ].includes(normalizeText(value));
}

export async function checkInstitutionStatus(
  input: InstitutionStatusInput,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<InstitutionStatusResult> {
  const resolvedInput = resolveInstitutionStatusInput(input);
  const institutionName = resolvedInput.institutionName?.trim() || null;
  const jurisdiction = resolvedInput.registryJurisdiction?.trim() || null;
  const normalizedInput = institutionName ? normalizeText(institutionName) : "";

  if (resolvedInput.identityReviewMessage) {
    return unableResult(resolvedInput, resolvedInput.identityReviewMessage);
  }

  if (!jurisdiction) {
    return unableResult(
      resolvedInput,
      institutionName
        ? "Jurisdiction unresolved. The exact institution name did not identify a jurisdiction in the available authoritative records, so no registry was selected."
        : "Institution identity requires review. The record does not provide a usable institution name or jurisdiction, so no registry was selected.",
    );
  }

  const additionalResult = await checkAdditionalInstitutionStatus(resolvedInput, fetcher);
  if (additionalResult) return additionalResult;

  if (isUnitedKingdom(resolvedInput.jurisdiction)) {
    return unableResult(
      resolvedInput,
      "The United Kingdom was supplied without a resolved nation. The exact institution name did not identify England, Scotland, Wales, or Northern Ireland, so no registry was selected.",
    );
  }

  if (!isGhana(jurisdiction)) {
    return unableResult(
      resolvedInput,
      "This jurisdiction is not supported by the implemented registry check. No institution status was inferred.",
    );
  }

  if (!institutionName || !normalizedInput) {
    return unableResult(
      resolvedInput,
      "The record does not include a usable institution name, so the GTEC directory could not be searched.",
      new Date(),
      true,
    );
  }

  try {
    const lookup = await getRegistryLookup(normalizedInput, fetcher);
    const matchedRecord = lookup.matchedRecord;

    if (!matchedRecord) {
      if (!lookup.snapshot) {
        throw new Error("The GTEC directory check did not produce a complete result.");
      }
      return createInstitutionStatusResult(resolvedInput, gtecSource, {
        status: "NOT_LISTED",
        checkedAt: lookup.checkedAt,
        matchedName: null,
        registryStatus: null,
        summary:
          "No exact institution-name match was found in the checked GTEC directory pages. This is not a conclusion about the institution's recognition or legitimacy.",
      });
    }

    return createInstitutionStatusResult(resolvedInput, gtecSource, {
      status: "LISTED",
      sourceUrl: matchedRecord.sourceUrl,
      checkedAt: lookup.checkedAt,
      matchedName: matchedRecord.name,
      registryStatus: matchedRecord.registryStatus,
      summary: matchedRecord.registryStatus
        ? `A matching institution record appears in the GTEC directory. The source's status field reads “${matchedRecord.registryStatus}.”`
        : "A matching institution record appears in the GTEC directory; the source did not provide a status value for this row.",
    });
  } catch {
    return unableResult(
      resolvedInput,
      "The GTEC directory could not be checked completely. No institution status was inferred.",
      new Date(),
      true,
    );
  }
}

export function unableToCheckInstitutionStatus(
  input: InstitutionStatusInput,
  summary: string,
): InstitutionStatusResult {
  const resolvedInput = resolveInstitutionStatusInput(input);
  return unableResult(
    resolvedInput,
    summary,
    new Date(),
    isGhana(resolvedInput.registryJurisdiction ?? resolvedInput.jurisdiction),
  );
}