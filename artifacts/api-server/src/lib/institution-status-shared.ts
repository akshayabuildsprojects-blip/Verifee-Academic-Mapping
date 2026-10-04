import type {
  RunInstitutionStatusCheckBody,
  RunInstitutionStatusCheckResponse,
} from "@workspace/api-zod";

export type InstitutionStatusInput = (typeof RunInstitutionStatusCheckBody)["_output"];
export type InstitutionStatusResult = (typeof RunInstitutionStatusCheckResponse)["_output"];

export type InstitutionStatusResolutionSource =
  | "TRANSCRIPT"
  | "RESOLVED_BY_VERIFEE"
  | "UNRESOLVED";

export type InstitutionStatusCheckInput = InstitutionStatusInput & {
  institutionNameSource?: InstitutionStatusResolutionSource;
  jurisdictionSource?: InstitutionStatusResolutionSource;
  registryJurisdiction?: string | null;
  identityReviewMessage?: string | null;
};

export type InstitutionStatusSource = {
  name: string;
  url: string;
  coverageLimits: string;
};

export type InstitutionStatusDetails = {
  status: "LISTED" | "NOT_LISTED";
  statusLabel?: string;
  institutionName?: string | null;
  institutionNameSource?: InstitutionStatusResolutionSource;
  jurisdictionSource?: InstitutionStatusResolutionSource;
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
  input: InstitutionStatusCheckInput,
  source: InstitutionStatusSource,
  details: InstitutionStatusDetails,
): InstitutionStatusResult {
  const transcriptName = input.institutionName?.trim() || null;
  const institutionName =
    details.institutionName !== undefined
      ? details.institutionName
      : details.matchedName ?? transcriptName;
  const institutionNameSource =
    details.institutionNameSource ??
    (details.matchedName &&
    transcriptName &&
    normalizeText(details.matchedName) !== normalizeText(transcriptName)
      ? "RESOLVED_BY_VERIFEE"
      : input.institutionNameSource ??
        (transcriptName ? "TRANSCRIPT" : "UNRESOLVED"));
  const jurisdiction = input.jurisdiction?.trim() || null;
  return {
    status: details.status,
    statusLabel:
      details.statusLabel ??
      (details.status === "LISTED" ? "Listed" : "No exact match found"),
    institutionName,
    institutionNameSource,
    jurisdiction,
    jurisdictionSource:
      details.jurisdictionSource ??
      input.jurisdictionSource ??
      (jurisdiction ? "TRANSCRIPT" : "UNRESOLVED"),
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
  input: InstitutionStatusCheckInput,
  summary: string,
  source: InstitutionStatusSource | null = null,
  checkedAt = new Date(),
): InstitutionStatusResult {
  const institutionName = input.institutionName?.trim() || null;
  const jurisdiction = input.jurisdiction?.trim() || null;
  return {
    status: "UNABLE_TO_CHECK",
    statusLabel: "Unable to check",
    institutionName,
    institutionNameSource:
      input.institutionNameSource ??
      (institutionName ? "TRANSCRIPT" : "UNRESOLVED"),
    jurisdiction,
    jurisdictionSource:
      input.jurisdictionSource ??
      (jurisdiction ? "TRANSCRIPT" : "UNRESOLVED"),
    sourceName: source?.name ?? null,
    sourceUrl: source?.url ?? null,
    checkedAt,
    matchedName: null,
    registryStatus: null,
    summary,
    coverageLimits: source?.coverageLimits ??
      "This implementation checks Ghana through GTEC, the United States through DAPIP, India through the UGC university list, Singapore through SSG's registered Private Education Institution listing, Scotland through the Scottish Government's recognised-bodies list, and England through the OfS Register. Other jurisdictions are not checked, and no comprehensive worldwide coverage is claimed.",
  };
}