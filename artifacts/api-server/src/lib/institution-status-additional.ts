import {
  createInstitutionStatusResult,
  createUnableInstitutionStatusResult,
  normalizeText,
  type InstitutionStatusInput,
  type InstitutionStatusResult,
  type InstitutionStatusSource,
} from "./institution-status-shared";

const dapipApiUrl = "https://ope.ed.gov/dapip/api/search/advanced";
const dapipHomeUrl = "https://ope.ed.gov/dapip/";
const dapipSource: InstitutionStatusSource = {
  name: "U.S. Department of Education — Database of Accredited Postsecondary Institutions and Programs (DAPIP)",
  url: dapipHomeUrl,
  coverageLimits:
    "This check searches DAPIP's U.S. accreditation database for exact institution or additional-location names. The Department of Education describes DAPIP data as agency-reported and warns it may be inaccurate, outdated, or incomplete. A missing exact match is not proof that an institution is unrecognized, illegitimate, or lacks accreditation; this check does not assess individual programmes.",
};

const ugcApiUrl =
  "https://www.ugc.gov.in/universitydetails/Getuniversity_details?unitypeID=0";
const ugcDirectoryUrl = "https://www.ugc.gov.in/universitydetails";
const ugcSource: InstitutionStatusSource = {
  name: "University Grants Commission (India) — University directory",
  url: ugcDirectoryUrl,
  coverageLimits:
    "This check searches the UGC's published Central, State, Private, and Deemed university list only. UGC list categories and any 2(f)/12B status text are source fields, not a general accreditation rating or proof of programme recognition. A missing exact match is not a conclusion about recognition, legitimacy, or degree equivalence.",
};

const singaporeApiUrl =
  "https://www.tpgateway.gov.sg/internal/TPportal/trainingpartners/SSGContentInterface/pei/PeiListing";
const singaporeDirectoryUrl =
  "https://www.tpgateway.gov.sg/resources/information-for-private-education-institutions-(peis)/pei-listing";
const singaporeSource: InstitutionStatusSource = {
  name: "SkillsFuture Singapore (SSG) Training Partners Gateway — PEI Listing",
  url: singaporeDirectoryUrl,
  coverageLimits:
    "This check searches SSG's registered Private Education Institution (PEI) listing only. It does not cover every Singapore higher-education institution, including the autonomous universities, and does not determine degree-awarding powers, course approval, quality, recognition, or legitimacy. A missing exact match is limited to this PEI source.",
};

const ofsApiUrl = "https://register-api.officeforstudents.org.uk/api/Provider";
const ofsRegisterUrl =
  "https://www.officeforstudents.org.uk/for-providers/registering-with-the-ofs/the-ofs-register";
const ofsSource: InstitutionStatusSource = {
  name: "Office for Students (OfS) Register — England",
  url: ofsRegisterUrl,
  coverageLimits:
    "This check searches the OfS Register of English higher-education providers and reports the register's own status. It does not cover Scotland, Wales, Northern Ireland, or all education providers, and a missing exact match is not proof that an institution is unrecognized, illegitimate, or that its programmes lack recognition.",
};

const requestTimeoutMs = 15_000;
const maxResponseBytes = 8_000_000;
const directoryCacheDurationMs = 6 * 60 * 60 * 1000;
const maxDapipPages = 50;
const maxSingaporePages = 100;

type CachedDirectory = {
  value: unknown;
  checkedAt: Date;
};

const directoryCache = new Map<string, CachedDirectory>();

type JsonRequest = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

async function fetchJson<T>(
  fetcher: typeof fetch,
  url: string,
  request: JsonRequest = {},
): Promise<T> {
  const response = await fetcher(url, {
    ...request,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}.`);
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
    throw new Error("Registry returned an unexpected content type.");
  }

  const text = await response.text();
  if (!text || text.length > maxResponseBytes) {
    throw new Error("Registry response was empty or exceeded the supported size.");
  }
  return JSON.parse(text) as T;
}

async function fetchCachedDirectory<T>(
  key: string,
  fetcher: typeof fetch,
  loader: (fetcher: typeof fetch) => Promise<T>,
): Promise<{ value: T; checkedAt: Date }> {
  if (fetcher === globalThis.fetch) {
    const cached = directoryCache.get(key);
    if (cached && Date.now() - cached.checkedAt.getTime() < directoryCacheDurationMs) {
      return { value: cached.value as T, checkedAt: cached.checkedAt };
    }
  }

  const value = await loader(fetcher);
  const checkedAt = new Date();
  if (fetcher === globalThis.fetch) directoryCache.set(key, { value, checkedAt });
  return { value, checkedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifierValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function matchesJurisdiction(value: string, names: string[]): boolean {
  const normalized = normalizeText(value);
  return names.some((name) => normalizeText(name) === normalized);
}

function requestedInstitutionName(input: InstitutionStatusInput): string | null {
  return input.institutionName?.trim() || null;
}

function dapipProfileUrl(unitId: string, parentUnitId?: string): string {
  const profilePath = parentUnitId
    ? `${encodeURIComponent(parentUnitId)}/${encodeURIComponent(unitId)}`
    : encodeURIComponent(unitId);
  return `https://ope.ed.gov/dapip/#/institution-profile/${profilePath}`;
}

type DapipLocation = {
  unitId: string;
  name: string;
  activeStatus: string | null;
  parentUnitId: string | null;
};

type DapipResponse = {
  Results?: unknown;
  Criteria?: unknown;
  AllUnitIds?: unknown;
};

function parseDapipResponse(
  payload: DapipResponse,
  expectedName: string,
  expectedPage: number,
): { results: DapipLocation[][]; allUnitIds: unknown[] } {
  if (
    !Array.isArray(payload.Results) ||
    !isRecord(payload.Criteria) ||
    !Array.isArray(payload.AllUnitIds)
  ) {
    throw new Error("DAPIP response did not contain complete search fields.");
  }
  if (payload.Results.length > 100) {
    throw new Error("DAPIP returned more records than the requested page size.");
  }
  if (
    payload.Criteria.LocationName !== expectedName ||
    payload.Criteria.PageNumber !== expectedPage ||
    payload.Criteria.RecordsPerPage !== 100
  ) {
    throw new Error("DAPIP did not confirm the requested search and page.");
  }
  if (payload.AllUnitIds.length < payload.Results.length) {
    throw new Error("DAPIP returned fewer location IDs than provider records.");
  }

  const results = payload.Results.map((value) => {
    if (!isRecord(value)) throw new Error("DAPIP returned a malformed provider record.");
    const unitId = identifierValue(value.unitid);
    const name = stringValue(value.institutionName);
    if (!unitId || !name) {
      throw new Error("DAPIP returned a provider without an ID or name.");
    }
    const locations: DapipLocation[] = [{
      unitId,
      name,
      activeStatus: stringValue(value.activeStatus),
      parentUnitId: null,
    }];

    if (value.additionalLocations !== undefined && value.additionalLocations !== null) {
      if (!Array.isArray(value.additionalLocations)) {
        throw new Error("DAPIP returned malformed additional-location data.");
      }
      for (const additional of value.additionalLocations) {
        if (!isRecord(additional)) {
          throw new Error("DAPIP returned a malformed additional location.");
        }
        const additionalId = identifierValue(additional.unitid);
        const additionalName = stringValue(additional.institutionName);
        if (!additionalId || !additionalName) {
          throw new Error("DAPIP returned an additional location without an ID or name.");
        }
        locations.push({
          unitId: additionalId,
          name: additionalName,
          activeStatus: stringValue(additional.activeStatus),
          parentUnitId: unitId,
        });
      }
    }
    return locations;
  });

  return { results, allUnitIds: payload.AllUnitIds };
}

type DapipMatch = DapipLocation;

async function checkUnitedStates(
  input: InstitutionStatusInput,
  institutionName: string,
  fetcher: typeof fetch,
): Promise<InstitutionStatusResult> {
  const matches: DapipMatch[] = [];
  let checkedPages = 0;
  let pageHasMore = true;

  while (pageHasMore && checkedPages < maxDapipPages) {
    const page = checkedPages + 1;
    const payload = await fetchJson<DapipResponse>(fetcher, dapipApiUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        LocationName: institutionName,
        RecordsPerPage: 100,
        PageNumber: page,
        SortAscending: true,
        SortField: "institutionName",
      }),
    });
    const response = parseDapipResponse(payload, institutionName, page);
    checkedPages += 1;

    for (const locationGroup of response.results) {
      for (const location of locationGroup) {
        if (normalizeText(location.name) === normalizeText(institutionName)) {
          matches.push(location);
        }
      }
    }
    pageHasMore = response.results.length === 100;
  }

  if (pageHasMore) throw new Error("DAPIP search exceeded the checked page limit.");
  const checkedAt = new Date();
  if (matches.length === 0) {
    return createInstitutionStatusResult(input, dapipSource, {
      status: "NOT_LISTED",
      matchedName: null,
      registryStatus: null,
      checkedAt,
      summary:
        "No exact institution or additional-location name was found in the complete DAPIP search response. DAPIP is an agency-reported database whose data may be inaccurate, outdated, or incomplete; this result is not a conclusion about recognition or legitimacy.",
    });
  }

  const match = matches[0]!;
  const ambiguity = matches.length > 1
    ? ` The search returned ${matches.length} exact-name records; this report shows one of them and does not determine which campus or record corresponds to the transcript.`
    : "";
  const registryStatus = match.activeStatus
    ? `Source active-status field: ${match.activeStatus}`
    : "The source did not provide an active-status value for this record";
  return createInstitutionStatusResult(input, dapipSource, {
    status: "LISTED",
    matchedName: match.name,
    registryStatus,
    sourceUrl: dapipProfileUrl(match.unitId, match.parentUnitId ?? undefined),
    checkedAt,
    summary:
      `An exact name appears in the U.S. Department of Education's DAPIP database. ${registryStatus}. DAPIP cautions that its agency-reported data may be inaccurate, outdated, or incomplete; this is not an independent accreditation or recognition judgment.${ambiguity}`,
  });
}

type UgcRecord = {
  ID: string;
  uni_name: string;
  uni_type: string;
  status: string | null;
};

type UgcResponse = {
  m?: unknown;
  c?: unknown;
  List?: unknown;
};

const ugcTypes = new Set([
  "Central",
  "State",
  "Private",
  "Deemed to be Universities",
]);

async function loadUgcDirectory(fetcher: typeof fetch): Promise<UgcRecord[]> {
  const payload = await fetchJson<UgcResponse>(fetcher, ugcApiUrl);
  if (payload.c !== "success" || payload.m !== "Data filled." || !Array.isArray(payload.List)) {
    throw new Error("UGC did not return its complete university list.");
  }
  if (payload.List.length === 0 || payload.List.length > 10_000) {
    throw new Error("UGC university list size was outside supported limits.");
  }

  const seenIds = new Set<string>();
  const seenTypes = new Set<string>();
  const records = payload.List.map((value): UgcRecord => {
    if (!isRecord(value)) throw new Error("UGC returned a malformed university record.");
    const id = identifierValue(value.ID);
    const name = stringValue(value.uni_name);
    const type = stringValue(value.uni_type);
    if (!id || !name || !type || !ugcTypes.has(type) || seenIds.has(id)) {
      throw new Error("UGC university list contains an incomplete or duplicate record.");
    }
    seenIds.add(id);
    seenTypes.add(type);
    return {
      ID: id,
      uni_name: name,
      uni_type: type,
      status: stringValue(value.status),
    };
  });
  if (seenTypes.size !== ugcTypes.size) {
    throw new Error("UGC response did not include all published university categories.");
  }
  return records;
}

async function checkIndia(
  input: InstitutionStatusInput,
  institutionName: string,
  fetcher: typeof fetch,
): Promise<InstitutionStatusResult> {
  const { value: records, checkedAt } = await fetchCachedDirectory(
    "ugc-university-list",
    fetcher,
    loadUgcDirectory,
  );
  const matches = records.filter(
    (record) => normalizeText(record.uni_name) === normalizeText(institutionName),
  );

  if (matches.length === 0) {
    return createInstitutionStatusResult(input, ugcSource, {
      status: "NOT_LISTED",
      matchedName: null,
      registryStatus: null,
      checkedAt,
      summary:
        "No exact institution-name match was found in the complete UGC university-list response. The UGC list has defined categories and status fields; a missing name is not a conclusion about recognition, legitimacy, programme approval, or degree equivalence.",
    });
  }

  const match = matches[0]!;
  const registryStatus =
    `${match.uni_type}${match.status ? `; UGC status field: ${match.status}` : "; no UGC status value supplied"}`;
  const ambiguity = matches.length > 1
    ? ` The directory contains ${matches.length} exact-name records; this report shows one and does not determine which record corresponds to the transcript.`
    : "";
  return createInstitutionStatusResult(input, ugcSource, {
    status: "LISTED",
    matchedName: match.uni_name,
    registryStatus,
    checkedAt,
    summary:
      `The UGC university list contains this exact name under “${match.uni_type}.” The published UGC status field is ${match.status ? `“${match.status}”` : "blank"}; that field is not a general accreditation rating.${ambiguity}`,
  });
}

type SingaporeRecord = {
  pei_id: string;
  pei_name: string;
  reg_no: string | null;
  expiry_date: string | null;
  status_cd_desc: string | null;
};

type SingaporeResponse = {
  pages?: unknown;
  totalItemsCount?: unknown;
  list?: unknown;
};

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function searchSingaporePeis(
  institutionName: string,
  fetcher: typeof fetch,
): Promise<{ records: SingaporeRecord[]; checkedAt: Date }> {
  const records: SingaporeRecord[] = [];
  const seenIds = new Set<string>();
  let expectedCount: number | null = null;
  let expectedPages: number | null = null;
  let pageSize: number | null = null;
  let checkedAt = new Date();

  for (let page = 1; page <= maxSingaporePages; page += 1) {
    const payload = await fetchJson<SingaporeResponse>(fetcher, singaporeApiUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        page: String(page),
        pei_id: "",
        q_pei: institutionName,
      }),
    });
    const count = nonNegativeInteger(payload.totalItemsCount);
    const pages = nonNegativeInteger(payload.pages);
    if (count === null || pages === null || !Array.isArray(payload.list)) {
      throw new Error("SSG returned an incomplete PEI search response.");
    }

    if (page === 1) {
      expectedCount = count;
      expectedPages = pages;
      if (count === 0) {
        if (pages !== 0 || payload.list.length !== 0) {
          throw new Error("SSG returned inconsistent empty-search counts.");
        }
        checkedAt = new Date();
        return { records, checkedAt };
      }
      pageSize = payload.list.length;
      if (pageSize === 0 || pages !== Math.ceil(count / pageSize)) {
        throw new Error("SSG PEI search pagination did not reconcile with its record count.");
      }
      if (pages > maxSingaporePages) {
        throw new Error("SSG PEI search exceeded the supported page limit.");
      }
    } else if (count !== expectedCount || pages !== expectedPages) {
      throw new Error("SSG PEI search totals changed while pages were being read.");
    }

    const expectedPageLength = Math.min(
      pageSize!,
      expectedCount! - (page - 1) * pageSize!,
    );
    if (payload.list.length !== expectedPageLength) {
      throw new Error("SSG PEI search returned an incomplete page.");
    }
    for (const value of payload.list) {
      if (!isRecord(value)) throw new Error("SSG returned a malformed PEI record.");
      const id = identifierValue(value.pei_id);
      const name = stringValue(value.pei_name);
      if (!id || !name || seenIds.has(id)) {
        throw new Error("SSG PEI list contains an unnamed or duplicate record.");
      }
      seenIds.add(id);
      records.push({
        pei_id: id,
        pei_name: name,
        reg_no: stringValue(value.reg_no),
        expiry_date: stringValue(value.expiry_date),
        status_cd_desc: stringValue(value.status_cd_desc),
      });
    }
    checkedAt = new Date();
    if (page === expectedPages) break;
  }

  if (
    expectedCount === null ||
    expectedPages === null ||
    records.length !== expectedCount ||
    (expectedPages > 0 && records.length === 0)
  ) {
    throw new Error("SSG PEI search did not return every advertised record.");
  }
  return { records, checkedAt };
}

async function checkSingapore(
  input: InstitutionStatusInput,
  institutionName: string,
  fetcher: typeof fetch,
): Promise<InstitutionStatusResult> {
  const { records, checkedAt } = await searchSingaporePeis(institutionName, fetcher);
  const matches = records.filter(
    (record) => normalizeText(record.pei_name) === normalizeText(institutionName),
  );

  if (matches.length === 0) {
    return createInstitutionStatusResult(input, singaporeSource, {
      status: "NOT_LISTED",
      matchedName: null,
      registryStatus: null,
      checkedAt,
      summary:
        "No exact name was found in the complete SSG Training Partners Gateway PEI search response. This covers only registered Private Education Institutions; it does not determine whether a provider appears on a separate university or recognition list.",
    });
  }

  const match = matches[0]!;
  const statusParts = [
    match.status_cd_desc ? `Source status: ${match.status_cd_desc}` : null,
    match.reg_no ? `Registration no. ${match.reg_no}` : null,
    match.expiry_date ? `Published validity end date: ${match.expiry_date}` : null,
  ].filter((part): part is string => part !== null);
  const registryStatus = statusParts.length
    ? statusParts.join("; ")
    : "The source lists this PEI but supplies no registration status or validity value.";
  const ambiguity = matches.length > 1
    ? ` The source returned ${matches.length} exact-name records; this report shows one and does not resolve the difference.`
    : "";
  return createInstitutionStatusResult(input, singaporeSource, {
    status: "LISTED",
    matchedName: match.pei_name,
    registryStatus,
    checkedAt,
    summary:
      `An exact record appears in SkillsFuture Singapore's registered PEI listing. ${registryStatus}. This is a source-specific registration record, not a determination of degree recognition or institutional legitimacy.${ambiguity}`,
  });
}

type OfsProvider = {
  Ukprn: string;
  LegalName: string;
  TradingName: string;
  SearchNames: unknown;
  RegistrationStatus: string;
  RegisteredCategory: unknown;
};

function parseOfsDirectory(value: unknown): OfsProvider[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) {
    throw new Error("OfS did not return its complete provider register.");
  }
  const seenUkprns = new Set<string>();
  return value.map((provider): OfsProvider => {
    if (!isRecord(provider)) throw new Error("OfS returned a malformed provider record.");
    const ukprn = stringValue(provider.Ukprn);
    const legalName = stringValue(provider.LegalName);
    const registrationStatus = stringValue(provider.RegistrationStatus);
    if (!ukprn || !legalName || !registrationStatus || seenUkprns.has(ukprn)) {
      throw new Error("OfS provider register contains an incomplete or duplicate record.");
    }
    if (
      provider.SearchNames !== null &&
      provider.SearchNames !== undefined &&
      !Array.isArray(provider.SearchNames)
    ) {
      throw new Error("OfS provider record has malformed search names.");
    }
    seenUkprns.add(ukprn);
    return {
      Ukprn: ukprn,
      LegalName: legalName,
      TradingName: stringValue(provider.TradingName) ?? "",
      SearchNames: provider.SearchNames,
      RegistrationStatus: registrationStatus,
      RegisteredCategory: provider.RegisteredCategory,
    };
  });
}

async function loadOfsDirectory(fetcher: typeof fetch): Promise<OfsProvider[]> {
  const response = await fetchJson<unknown>(fetcher, ofsApiUrl);
  return parseOfsDirectory(response);
}

function ofsNameMatches(provider: OfsProvider, normalizedName: string): boolean {
  const names = [
    provider.LegalName,
    ...provider.TradingName.split(/\r?\n/),
    ...(Array.isArray(provider.SearchNames)
      ? provider.SearchNames.filter((name): name is string => typeof name === "string")
      : []),
  ];
  return names.some((name) => {
    const normalized = normalizeText(name).replace(/^the\s+/, "");
    return normalized !== "not applicable" && normalized === normalizedName;
  });
}

async function checkEngland(
  input: InstitutionStatusInput,
  institutionName: string,
  fetcher: typeof fetch,
): Promise<InstitutionStatusResult> {
  const { value: providers, checkedAt } = await fetchCachedDirectory(
    "ofs-provider-register",
    fetcher,
    loadOfsDirectory,
  );
  const comparableName = normalizeText(institutionName).replace(/^the\s+/, "");
  const matches = providers.filter((provider) =>
    ofsNameMatches(provider, comparableName),
  );

  if (matches.length === 0) {
    return createInstitutionStatusResult(input, ofsSource, {
      status: "NOT_LISTED",
      matchedName: null,
      registryStatus: null,
      checkedAt,
      summary:
        "No exact legal, trading, or search-name match was found in the complete OfS Register data returned for England. This is limited to the OfS register and is not a conclusion about recognition, legitimacy, or institutions covered by other UK regulators.",
    });
  }

  const match = matches[0]!;
  const category = stringValue(match.RegisteredCategory);
  const registryStatus = category
    ? `${match.RegistrationStatus}; category: ${category}`
    : match.RegistrationStatus;
  const ambiguity = matches.length > 1
    ? ` The source returned ${matches.length} exact-name provider records; this report shows one and does not determine which record corresponds to the transcript.`
    : "";
  const recordUrl =
    `${ofsRegisterUrl}/#/provider/${encodeURIComponent(match.Ukprn)}`;
  return createInstitutionStatusResult(input, ofsSource, {
    status: "LISTED",
    matchedName: match.LegalName,
    registryStatus,
    sourceUrl: recordUrl,
    checkedAt,
    summary:
      `An exact legal, trading, or search-name match appears in the OfS Register for England. The register's published status is “${match.RegistrationStatus}”${category ? ` and its category is “${category}”` : ""}. This describes the OfS record only; it is not a universal recognition or legitimacy judgment.${ambiguity}`,
  });
}

export function getAdditionalInstitutionStatusSource(
  jurisdiction: string | null,
): InstitutionStatusSource | null {
  if (!jurisdiction?.trim()) return null;
  if (matchesJurisdiction(jurisdiction, [
    "United States",
    "United States of America",
    "US",
    "USA",
  ])) {
    return dapipSource;
  }
  if (matchesJurisdiction(jurisdiction, [
    "India",
    "Republic of India",
    "Bharat",
    "IN",
  ])) {
    return ugcSource;
  }
  if (matchesJurisdiction(jurisdiction, [
    "Singapore",
    "Republic of Singapore",
    "SG",
  ])) {
    return singaporeSource;
  }
  if (matchesJurisdiction(jurisdiction, ["England"])) return ofsSource;
  return null;
}

export async function checkAdditionalInstitutionStatus(
  input: InstitutionStatusInput,
  fetcher: typeof fetch,
): Promise<InstitutionStatusResult | null> {
  const source = getAdditionalInstitutionStatusSource(input.jurisdiction);
  if (!source) return null;

  let check: (name: string) => Promise<InstitutionStatusResult>;
  if (source === dapipSource) {
    check = (name) => checkUnitedStates(input, name, fetcher);
  } else if (source === ugcSource) {
    check = (name) => checkIndia(input, name, fetcher);
  } else if (source === singaporeSource) {
    check = (name) => checkSingapore(input, name, fetcher);
  } else {
    check = (name) => checkEngland(input, name, fetcher);
  }

  const institutionName = requestedInstitutionName(input);
  if (!institutionName || !normalizeText(institutionName)) {
    return createUnableInstitutionStatusResult(
      input,
      `The record does not include a usable institution name, so the ${source.name} could not be searched.`,
      source,
    );
  }

  try {
    return await check(institutionName);
  } catch {
    return createUnableInstitutionStatusResult(
      input,
      `The ${source.name} could not be checked completely. No institution status was inferred.`,
      source,
    );
  }
}