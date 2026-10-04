import {
  normalizeText,
  type InstitutionStatusCheckInput,
  type InstitutionStatusInput,
  type InstitutionStatusResolutionSource,
} from "./institution-status-shared";

type KnownInstitutionIdentity = {
  aliases: string[];
  canonicalName: string;
  jurisdiction: string;
  registryJurisdiction: string;
  acceptedTranscriptJurisdictions: string[];
  specificTranscriptJurisdictions: string[];
};

// These exact aliases are intentionally narrow. Their canonical identities and locations are
// backed by official source pages: strath.ac.uk/contactus/quickcontacts,
// gov.scot/policies/universities,
// moe.gov.sg/post-secondary/overview/autonomous-universities/ntu, and gatech.edu.
const knownInstitutionIdentities: KnownInstitutionIdentity[] = [
  {
    aliases: [
      "University of Strathclyde",
      "The University of Strathclyde",
      "Strathclyde University",
      "University of Strathclyde, Glasgow",
    ],
    canonicalName: "University of Strathclyde",
    jurisdiction: "Scotland, United Kingdom",
    registryJurisdiction: "Scotland",
    acceptedTranscriptJurisdictions: [
      "Scotland",
      "Scotland, United Kingdom",
      "Scotland, UK",
      "Glasgow",
      "Glasgow, Scotland",
      "Glasgow, Scotland, United Kingdom",
      "Glasgow, Scotland, UK",
      "Glasgow, United Kingdom",
      "Glasgow, UK",
      "United Kingdom",
      "United Kingdom of Great Britain and Northern Ireland",
      "Great Britain",
      "UK",
      "GB",
    ],
    specificTranscriptJurisdictions: [
      "Scotland",
      "Scotland, United Kingdom",
      "Scotland, UK",
      "Glasgow, Scotland, United Kingdom",
      "Glasgow, Scotland, UK",
    ],
  },
  {
    aliases: [
      "Nanyang Technological University",
      "Nanyang Technological University Singapore",
      "NTU Singapore",
    ],
    canonicalName: "Nanyang Technological University",
    jurisdiction: "Singapore",
    registryJurisdiction: "Singapore",
    acceptedTranscriptJurisdictions: [
      "Singapore",
      "Republic of Singapore",
      "SG",
    ],
    specificTranscriptJurisdictions: [
      "Singapore",
      "Republic of Singapore",
      "SG",
    ],
  },
  {
    aliases: ["Georgia Institute of Technology", "Georgia Tech"],
    canonicalName: "Georgia Institute of Technology",
    jurisdiction: "Georgia, United States",
    registryJurisdiction: "United States",
    acceptedTranscriptJurisdictions: [
      "Georgia",
      "Georgia, United States",
      "Georgia, USA",
      "Georgia, US",
      "United States",
      "United States of America",
      "USA",
      "US",
      "State of Georgia",
      "State of Georgia, United States",
    ],
    specificTranscriptJurisdictions: [
      "Georgia, United States",
      "Georgia, USA",
      "Georgia, US",
      "State of Georgia, United States",
    ],
  },
];

function sourceForTranscriptValue(
  value: string | null,
): InstitutionStatusResolutionSource {
  return value ? "TRANSCRIPT" : "UNRESOLVED";
}

function sameNormalizedValue(left: string, right: string): boolean {
  return normalizeText(left) === normalizeText(right);
}

export function resolveInstitutionStatusInput(
  input: InstitutionStatusInput,
): InstitutionStatusCheckInput {
  const transcriptName = input.institutionName?.trim() || null;
  const transcriptJurisdiction = input.jurisdiction?.trim() || null;
  const normalizedName = transcriptName ? normalizeText(transcriptName) : "";
  const matches = knownInstitutionIdentities.filter((identity) =>
    identity.aliases.some((alias) => normalizeText(alias) === normalizedName),
  );

  const unchanged: InstitutionStatusCheckInput = {
    ...input,
    institutionName: transcriptName,
    jurisdiction: transcriptJurisdiction,
    institutionNameSource: sourceForTranscriptValue(transcriptName),
    jurisdictionSource: sourceForTranscriptValue(transcriptJurisdiction),
    registryJurisdiction: transcriptJurisdiction,
    identityReviewMessage: null,
  };

  if (matches.length > 1) {
    return {
      ...unchanged,
      registryJurisdiction: null,
      identityReviewMessage:
        "Institution identity requires review. The name matches more than one verified institution identity, so no registry was selected.",
    };
  }

  const identity = matches[0];
  if (!identity) return unchanged;

  if (
    transcriptJurisdiction &&
    !identity.acceptedTranscriptJurisdictions.some((accepted) =>
      sameNormalizedValue(transcriptJurisdiction, accepted),
    )
  ) {
    return {
      ...unchanged,
      registryJurisdiction: null,
      identityReviewMessage:
        "Institution identity requires review. The transcript's jurisdiction conflicts with the authoritative location associated with this exact institution name, so no registry was searched.",
    };
  }

  const institutionNameSource: InstitutionStatusResolutionSource =
    transcriptName && sameNormalizedValue(transcriptName, identity.canonicalName)
      ? "TRANSCRIPT"
      : "RESOLVED_BY_VERIFEE";
  const jurisdictionSource: InstitutionStatusResolutionSource =
    transcriptJurisdiction &&
    identity.specificTranscriptJurisdictions.some((specific) =>
      sameNormalizedValue(transcriptJurisdiction, specific),
    )
      ? "TRANSCRIPT"
      : "RESOLVED_BY_VERIFEE";

  return {
    ...input,
    institutionName: identity.canonicalName,
    jurisdiction: identity.jurisdiction,
    institutionNameSource,
    jurisdictionSource,
    registryJurisdiction: identity.registryJurisdiction,
    identityReviewMessage: null,
  };
}