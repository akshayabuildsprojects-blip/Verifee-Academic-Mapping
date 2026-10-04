import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInstitutionStatus } from "../src/lib/institution-status";

const dapipUrl = "https://ope.ed.gov/dapip/api/search/advanced";
const ugcUrl =
  "https://www.ugc.gov.in/universitydetails/Getuniversity_details?unitypeID=0";
const singaporeUrl =
  "https://www.tpgateway.gov.sg/internal/TPportal/trainingpartners/SSGContentInterface/pei/PeiListing";
const ofsUrl = "https://register-api.officeforstudents.org.uk/api/Provider";
const scotlandUrl = "https://www.gov.scot/policies/universities";

type MockRequest = {
  url: string;
  init?: RequestInit;
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function mockFetcher(
  handler: (request: MockRequest) => Response | Promise<Response>,
  requested: MockRequest[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = {
      url: input instanceof Request ? input.url : String(input),
      init: init ?? (input instanceof Request ? input : undefined),
    };
    requested.push(request);
    return handler(request);
  }) as typeof fetch;
}

function dapipPage(
  page: number,
  results: unknown[],
  allUnitIds: unknown[] = results,
  expectedName = "Example University",
) {
  return {
    Results: results,
    Criteria: {
      LocationName: expectedName,
      RecordsPerPage: 100,
      PageNumber: page,
    },
    AllUnitIds: allUnitIds,
  };
}

const scottishRecognisedBodies = [
  "University of Aberdeen",
  "Abertay University",
  "University of Dundee",
  "University of Edinburgh",
  "Edinburgh Napier University",
  "University of Glasgow",
  "Glasgow Caledonian University",
  "Heriot-Watt University",
  "University of the Highlands and Islands",
  "The Open University in Scotland",
  "Queen Margaret University",
  "Robert Gordon University",
  "Royal Conservatoire of Scotland",
  "Scotland’s Rural College",
  "University of St Andrews",
  "University of Stirling",
  "University of Strathclyde",
  "University of the West of Scotland",
];

function scottishRecognisedBodiesHtml(): string {
  const recognized = scottishRecognisedBodies
    .map((name) => `<li><a href="https://example.gov.scot/${encodeURIComponent(name)}">${name}</a></li>`)
    .join("");
  return `<html><body>
    <h3>Recognised bodies</h3>
    <p>The following higher education institutions in Scotland have degree awarding powers, and are recognised bodies:</p>
    <ul>${recognized}</ul>
    <p>The following institution does not have degree awarding powers.</p>
    <ul><li>The Glasgow School of Art</li></ul>
    </body></html>`;
}

function dapipRecord(name: string, unitId: number) {
  return {
    unitid: unitId,
    institutionName: name,
    activeStatus: "Active",
    additionalLocations: [],
  };
}

test("checks exact U.S. DAPIP matches and preserves the source active status", async () => {
  const requested: MockRequest[] = [];
  const fetcher = mockFetcher(
    () => jsonResponse(dapipPage(1, [dapipRecord("Example University", 12345)])),
    requested,
  );
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "United States" },
    fetcher,
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.jurisdiction, "United States");
  assert.equal(result.matchedName, "Example University");
  assert.equal(result.registryStatus, "Source active-status field: Active");
  assert.match(result.summary, /field: Active\. DAPIP cautions/);
  assert.equal(result.sourceName?.includes("DAPIP"), true);
  assert.match(result.sourceUrl ?? "", /#\/institution-profile\/12345$/);
  assert.match(result.coverageLimits, /inaccurate, outdated, or incomplete/);
  assert.equal(requested.length, 1);
});

test("reports a U.S. miss only after the complete DAPIP result page is read", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "USA" },
    mockFetcher(() =>
      jsonResponse(dapipPage(1, [dapipRecord("Different University", 56789)])),
    ),
  );

  assert.equal(result.status, "NOT_LISTED");
  assert.equal(result.matchedName, null);
  assert.match(result.summary, /No exact institution or additional-location name/);
  assert.equal(result.jurisdiction, "USA");
});

test("keeps a DAPIP search unable when a later advertised result page fails", async () => {
  const requested: MockRequest[] = [];
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    dapipRecord(`Different University ${index}`, index + 1),
  );
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "United States" },
    mockFetcher(({ url, init }) => {
      if (url !== dapipUrl) return new Response("", { status: 404 });
      const requestBody = JSON.parse(String(init?.body)) as { PageNumber: number };
      return requestBody.PageNumber === 1
        ? jsonResponse(dapipPage(1, firstPage))
        : new Response("", { status: 503 });
    }, requested),
  );

  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.match(result.summary, /could not be checked completely/);
  assert.equal(result.sourceName?.includes("DAPIP"), true);
  assert.equal(requested.length, 2);
});

const completeUgcList = [
  { ID: "1", uni_name: "Example University", uni_type: "Central", status: "2(f)" },
  { ID: "2", uni_name: "State Example University", uni_type: "State", status: "2(f)" },
  { ID: "3", uni_name: "Private Example University", uni_type: "Private", status: "2(f)" },
  { ID: "4", uni_name: "Example Deemed University", uni_type: "Deemed to be Universities", status: "12B" },
];

test("checks the UGC category and published status for an Indian university", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "India" },
    mockFetcher(({ url }) => {
      assert.equal(url, ugcUrl);
      return jsonResponse({ m: "Data filled.", c: "success", List: completeUgcList });
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "Example University");
  assert.equal(result.registryStatus, "Central; UGC status field: 2(f)");
  assert.equal(result.sourceName?.includes("University Grants Commission"), true);
  assert.match(result.summary, /not a general accreditation rating/);
  assert.match(result.coverageLimits, /programme recognition/);
});

test("reports an Indian miss only when the UGC response includes every university type", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Missing University", jurisdiction: "Republic of India" },
    mockFetcher(() =>
      jsonResponse({ m: "Data filled.", c: "success", List: completeUgcList }),
    ),
  );
  assert.equal(result.status, "NOT_LISTED");
  assert.match(result.summary, /complete UGC university-list response/);
});

test("keeps an incomplete UGC directory response as unable to check", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "India" },
    mockFetcher(() =>
      jsonResponse({
        m: "Data filled.",
        c: "success",
        List: completeUgcList.slice(0, 1),
      }),
    ),
  );
  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.sourceName?.includes("University Grants Commission"), true);
});

function singaporeRecord(name: string) {
  return {
    pei_id: "6",
    pei_name: name,
    reg_no: "200606974C",
    expiry_date: "7/17/2027 12:00:00 AM",
    status_cd_desc: "",
  };
}

test("checks Singapore's registered PEI listing and published record fields", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "AMITY GLOBAL INSTITUTE", jurisdiction: "Singapore" },
    mockFetcher(({ url, init }) => {
      assert.equal(url, singaporeUrl);
      const requestBody = JSON.parse(String(init?.body)) as {
        page: string;
        q_pei: string;
      };
      assert.equal(requestBody.page, "1");
      assert.equal(requestBody.q_pei, "AMITY GLOBAL INSTITUTE");
      return jsonResponse({
        pages: "1",
        totalItemsCount: "1",
        list: [singaporeRecord("AMITY GLOBAL INSTITUTE")],
      });
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "AMITY GLOBAL INSTITUTE");
  assert.match(result.registryStatus ?? "", /200606974C/);
  assert.match(result.registryStatus ?? "", /validity end date/);
  assert.match(result.coverageLimits, /autonomous universities/);
});

test("reports a Singapore PEI miss only after a valid empty search response", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "National University of Singapore", jurisdiction: "SG" },
    mockFetcher(() =>
      jsonResponse({ pages: "0", totalItemsCount: "0", list: [] }),
    ),
  );
  assert.equal(result.status, "NOT_LISTED");
  assert.match(result.summary, /registered Private Education Institutions/);
  assert.match(result.coverageLimits, /not cover every Singapore higher-education institution/);
});

test("does not infer a Singapore miss from an incomplete PEI page", async () => {
  const firstPage = Array.from({ length: 10 }, (_, index) =>
    ({ ...singaporeRecord(`Matching School ${index}`), pei_id: String(index + 1) }),
  );
  const result = await checkInstitutionStatus(
    { institutionName: "Missing PEI", jurisdiction: "Singapore" },
    mockFetcher(({ init }) => {
      const requestBody = JSON.parse(String(init?.body)) as { page: string };
      return requestBody.page === "1"
        ? jsonResponse({ pages: "2", totalItemsCount: "11", list: firstPage })
        : jsonResponse({ pages: "2", totalItemsCount: "11", list: [] });
    }),
  );
  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.sourceName?.includes("Training Partners Gateway"), true);
});

const ofsProviders = [
  {
    Ukprn: "10001234",
    LegalName: "Example University Limited",
    TradingName: "Example University",
    SearchNames: ["Example University Limited", "Example University"],
    RegistrationStatus: "Registered",
    RegisteredCategory: "Approved (fee cap)",
  },
];

test("checks England's OfS register aliases and published registration status", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "England" },
    mockFetcher(({ url }) => {
      assert.equal(url, ofsUrl);
      return jsonResponse(ofsProviders);
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "Example University Limited");
  assert.equal(result.registryStatus, "Registered; category: Approved (fee cap)");
  assert.match(result.sourceUrl ?? "", /#\/provider\/10001234$/);
  assert.match(result.coverageLimits, /Scotland, Wales, Northern Ireland/);
});

test("matches England's registered university name with or without its leading article", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "University of Oxford", jurisdiction: "England" },
    mockFetcher(() =>
      jsonResponse([
        {
          Ukprn: "10007774",
          LegalName: "The Chancellor, Masters and Scholars of the University of Oxford",
          TradingName: "Oxford University\nThe University of Oxford",
          SearchNames: [
            "The Chancellor, Masters and Scholars of the University of Oxford",
            "Oxford University",
            "The University of Oxford",
          ],
          RegistrationStatus: "Registered",
          RegisteredCategory: "Approved (fee cap)",
        },
      ]),
    ),
  );
  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "The Chancellor, Masters and Scholars of the University of Oxford");
  assert.match(result.sourceUrl ?? "", /#\/provider\/10007774$/);
});

test("reports an England OfS miss only after validating the full provider response", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Missing Provider", jurisdiction: "England" },
    mockFetcher(() => jsonResponse(ofsProviders)),
  );
  assert.equal(result.status, "NOT_LISTED");
  assert.equal(result.matchedName, null);
  assert.match(result.summary, /complete OfS Register data returned for England/);
});

test("keeps England unavailable when OfS provider data is malformed", async () => {
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "England" },
    mockFetcher(() => jsonResponse([{ Ukprn: "10001234", LegalName: "" }])),
  );
  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.sourceName?.includes("Office for Students"), true);
});

test("does not treat the United Kingdom as England or call the OfS source", async () => {
  let requestCount = 0;
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "United Kingdom" },
    mockFetcher(() => {
      requestCount += 1;
      return jsonResponse([]);
    }),
  );
  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.sourceName, null);
  assert.equal(requestCount, 0);
});

test("resolves the University of Strathclyde to Scotland and checks the Scottish Government list", async () => {
  const requested: MockRequest[] = [];
  const result = await checkInstitutionStatus(
    { institutionName: "University of Strathclyde", jurisdiction: null },
    mockFetcher((request) => {
      requested.push(request);
      return htmlResponse(scottishRecognisedBodiesHtml());
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.statusLabel, "Recognised");
  assert.equal(result.institutionName, "University of Strathclyde");
  assert.equal(result.institutionNameSource, "TRANSCRIPT");
  assert.equal(result.jurisdiction, "Scotland, United Kingdom");
  assert.equal(result.jurisdictionSource, "RESOLVED_BY_VERIFEE");
  assert.equal(result.matchedName, "University of Strathclyde");
  assert.equal(result.sourceName, "Scottish Government — Recognised bodies");
  assert.equal(result.sourceUrl, scotlandUrl);
  assert.match(result.registryStatus ?? "", /degree-awarding powers/);
  assert.match(result.coverageLimits, /Scottish Government/);
  assert.deepEqual(requested.map((request) => request.url), [scotlandUrl]);
  assert.doesNotMatch(result.sourceName ?? "", /Office for Students|OfS/);
});

test("resolves a broad United Kingdom transcript jurisdiction to Scotland for Strathclyde", async () => {
  const requested: MockRequest[] = [];
  const result = await checkInstitutionStatus(
    { institutionName: "University of Strathclyde", jurisdiction: "United Kingdom" },
    mockFetcher((request) => {
      requested.push(request);
      return htmlResponse(scottishRecognisedBodiesHtml());
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.jurisdiction, "Scotland, United Kingdom");
  assert.equal(result.jurisdictionSource, "RESOLVED_BY_VERIFEE");
  assert.deepEqual(requested.map((request) => request.url), [scotlandUrl]);
});

test("requires review when the transcript jurisdiction conflicts with the exact institution identity", async () => {
  let requestCount = 0;
  const result = await checkInstitutionStatus(
    { institutionName: "University of Strathclyde", jurisdiction: "England" },
    mockFetcher(() => {
      requestCount += 1;
      return jsonResponse([]);
    }),
  );

  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.sourceName, null);
  assert.match(result.summary, /Institution identity requires review/);
  assert.equal(requestCount, 0);
});

test("resolves Nanyang Technological University to Singapore when the transcript omits jurisdiction", async () => {
  const requested: MockRequest[] = [];
  const result = await checkInstitutionStatus(
    { institutionName: "Nanyang Technological University", jurisdiction: null },
    mockFetcher((request) => {
      requested.push(request);
      return jsonResponse({ pages: 0, totalItemsCount: 0, list: [] });
    }),
  );

  assert.equal(result.status, "NOT_LISTED");
  assert.equal(result.institutionName, "Nanyang Technological University");
  assert.equal(result.jurisdiction, "Singapore");
  assert.equal(result.jurisdictionSource, "RESOLVED_BY_VERIFEE");
  assert.equal(result.sourceName?.includes("SkillsFuture Singapore"), true);
  assert.equal(requested[0]?.url, singaporeUrl);
});

test("resolves Georgia Tech to Georgia, United States before selecting DAPIP", async () => {
  const name = "Georgia Institute of Technology";
  const requested: MockRequest[] = [];
  const result = await checkInstitutionStatus(
    { institutionName: name, jurisdiction: null },
    mockFetcher((request) => {
      requested.push(request);
      return jsonResponse(dapipPage(1, [dapipRecord(name, 12345)], undefined, name));
    }),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.jurisdiction, "Georgia, United States");
  assert.equal(result.jurisdictionSource, "RESOLVED_BY_VERIFEE");
  assert.equal(result.sourceName?.includes("DAPIP"), true);
  assert.equal(requested[0]?.url, dapipUrl);
});

test("does not choose a provider when the OfS register returns duplicate exact identities", async () => {
  const duplicateProviders = [
    {
      Ukprn: "10001234",
      LegalName: "Example University",
      TradingName: "",
      SearchNames: [],
      RegistrationStatus: "Approved",
      RegisteredCategory: "Approved",
    },
    {
      Ukprn: "10005678",
      LegalName: "Example University",
      TradingName: "",
      SearchNames: [],
      RegistrationStatus: "Approved",
      RegisteredCategory: "Approved",
    },
  ];
  const result = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "England" },
    mockFetcher(() => jsonResponse(duplicateProviders)),
  );

  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.equal(result.matchedName, null);
  assert.match(result.summary, /Institution identity requires review/);
});