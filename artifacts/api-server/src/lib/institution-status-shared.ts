import type {
  RunInstitutionStatusCheckBody,
  RunInstitutionStatusCheckResponse,
} from "@workspace/api-zod";

export type InstitutionStatusInput = (typeof RunInstitutionStatusCheckBody)["_output"];
export type InstitutionStatusResult = (typeof RunInstitutionStatusCheckResponse)["_output"];

export type InstitutionStatusSource = {
  name: string;
  url: string;
  coverageLimits: string;
};

export type InstitutionStatusDetails = {
  status: "LISTED" | "NOT_LISTED";
  matchedName: string | null;
  registryStatus: string | null;
  summary: string;
  checkedAt?: Date;
  sourceUrl?: string;
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function createInstitutionStatusResult(
  input: InstitutionStatusInput,
  source: InstitutionStatusSource,
  details: InstitutionStatusDetails,
): InstitutionStatusResult {
  return {
    status: details.status,
    jurisdiction: input.jurisdiction?.trim() || null,
    sourceName: source.name,
    sourceUrl: details.sourceUrl ?? source.url,
    checkedAt: details.checkedAt ?? new Date(),
    matchedName: details.matchedName,
    registryStatus: details.registryStatus,
    summary: details.summary,
    coverageLimits: source.coverageLimits,
  };
}

export function createUnableInstitutionStatusResult(
  input: InstitutionStatusInput,
  summary: string,
  source: InstitutionStatusSource | null = null,
  checkedAt = new Date(),
): InstitutionStatusResult {
  return {
    status: "UNABLE_TO_CHECK",
    jurisdiction: input.jurisdiction?.trim() || null,
    sourceName: source?.name ?? null,
    sourceUrl: source?.url ?? null,
    checkedAt,
    matchedName: null,
    registryStatus: null,
    summary,
    coverageLimits: source?.coverageLimits ??
      "This implementation checks Ghana through GTEC, the United States through DAPIP, India through the UGC university list, Singapore through SSG's registered Private Education Institution listing, and England through the OfS Register. Other jurisdictions are not checked, and no comprehensive worldwide coverage is claimed.",
  };
}