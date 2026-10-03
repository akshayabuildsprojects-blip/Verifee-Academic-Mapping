import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInstitutionStatus } from "../src/lib/institution-status";

const institutionInput = {
  institutionName: "University of Cape Coast",
  jurisdiction: "Ghana",
};

const categoryUrl =
  "https://gtec.edu.gh/institutions/?category=Traditional+University";

function directoryIndex(expectedCount: number): string {
  return `<table>
    <thead><tr><th>Category</th><th>Total Institutions</th><th>Action</th></tr></thead>
    <tbody><tr>
      <td><a href="${categoryUrl}">Traditional University</a></td>
      <td>${expectedCount}</td><td>View Details</td>
    </tr></tbody>
  </table>`;
}

function institutionTable(rows: string, pagination = ""): string {
  return `<table>
    <thead><tr><th>Name</th><th>Location</th><th>Category</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${pagination}`;
}

function institutionRow(name: string, status = "Current"): string {
  return `<tr>
    <td><a href="https://gtec.edu.gh/programmes/?institutionId=878">${name}</a></td>
    <td>Cape Coast</td><td>Traditional University</td><td>${status}</td>
    <td>—</td><td>—</td><td>View Programmes</td>
  </tr>`;
}

function mockFetcher(
  responses: Map<string, { status: number; body: string }>,
  requestedUrls: string[],
  expectedCount = 1,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requestedUrls.push(url);
    if (url.endsWith("/explore-institutions/")) {
      return new Response(directoryIndex(expectedCount), {
        status: 200,
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }
    const response = responses.get(url);
    if (!response) return new Response("", { status: 404 });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  }) as typeof fetch;
}

test("reports a listed match with the registry status and source page", async () => {
  const requestedUrls: string[] = [];
  const result = await checkInstitutionStatus(
    institutionInput,
    mockFetcher(
      new Map([
        [
          categoryUrl,
          { status: 200, body: institutionTable(institutionRow("University of Cape Coast")) },
        ],
      ]),
      requestedUrls,
    ),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "University of Cape Coast");
  assert.equal(result.registryStatus, "Current");
  assert.equal(result.sourceName?.includes("Ghana Tertiary Education Commission"), true);
  assert.equal(result.sourceUrl, categoryUrl);
  assert.equal(result.jurisdiction, "Ghana");
  assert.equal(result.checkedAt instanceof Date, true);
  assert.ok(Number.isFinite(result.checkedAt.getTime()));
  assert.match(result.coverageLimits, /does not establish that an institution is unrecognized/);
  assert.equal(requestedUrls.length, 2);
});

test("reports not listed only after every published category page is complete", async () => {
  const requestedUrls: string[] = [];
  const pageTwoUrl = new URL(categoryUrl);
  pageTwoUrl.searchParams.set("pg", "2");
  const result = await checkInstitutionStatus(
    { institutionName: "Some Other University", jurisdiction: "Ghana" },
    mockFetcher(
      new Map([
        [
          categoryUrl,
          {
            status: 200,
            body: institutionTable(
              institutionRow("Different University One"),
              `<a href="${pageTwoUrl.href.replace("&pg=2", "&#038;pg=2")}">2</a>`,
            ),
          },
        ],
        [
          pageTwoUrl.href,
          {
            status: 200,
            body: institutionTable(institutionRow("Different University Two")),
          },
        ],
      ]),
      requestedUrls,
      2,
    ),
  );

  assert.equal(result.status, "NOT_LISTED");
  assert.equal(result.matchedName, null);
  assert.equal(result.registryStatus, null);
  assert.equal(result.sourceUrl, "https://gtec.edu.gh/explore-institutions/");
  assert.match(result.summary, /No exact institution-name match/);
  assert.equal(requestedUrls.length, 3);
  assert.ok(requestedUrls.includes(pageTwoUrl.href));
});

test("returns a listed match found on a later directory page", async () => {
  const requestedUrls: string[] = [];
  const pageTwoUrl = new URL(categoryUrl);
  pageTwoUrl.searchParams.set("pg", "2");
  const result = await checkInstitutionStatus(
    institutionInput,
    mockFetcher(
      new Map([
        [
          categoryUrl,
          {
            status: 200,
            body: institutionTable(
              institutionRow("Different University One"),
              `<a href="${pageTwoUrl.href.replace("&pg=2", "&#038;pg=2")}">2</a>`,
            ),
          },
        ],
        [
          pageTwoUrl.href,
          {
            status: 200,
            body: institutionTable(institutionRow("University of Cape Coast", "Active")),
          },
        ],
      ]),
      requestedUrls,
      2,
    ),
  );

  assert.equal(result.status, "LISTED");
  assert.equal(result.matchedName, "University of Cape Coast");
  assert.equal(result.registryStatus, "Active");
  assert.equal(result.sourceUrl, pageTwoUrl.href);
  assert.ok(requestedUrls.includes(pageTwoUrl.href));
});

test("returns unable to check when a paginated source page fails", async () => {
  const requestedUrls: string[] = [];
  const pageOne = institutionTable(
    institutionRow("University of Cape Coast"),
    `<a href="https://gtec.edu.gh/institutions/?category=Traditional+University&#038;pg=2">2</a>
     <a href="https://gtec.edu.gh/institutions/?category=Traditional+University&#038;pg=2">Last &raquo;&raquo;</a>`,
  );
  const fetcher = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requestedUrls.push(url);
    if (url.endsWith("/explore-institutions/")) {
      return new Response(directoryIndex(2), {
        status: 200,
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }
    if (url === categoryUrl) {
      return new Response(pageOne, {
        status: 200,
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }
    return new Response("", { status: 503 });
  }) as typeof fetch;

  const result = await checkInstitutionStatus(
    { institutionName: "A University Not on Page One", jurisdiction: "Ghana" },
    fetcher,
  );

  assert.equal(result.status, "UNABLE_TO_CHECK");
  assert.match(result.summary, /could not be checked completely/);
  assert.ok(requestedUrls.some((url) => new URL(url).searchParams.get("pg") === "2"));
});

test("does not call a Ghana-only registry for unsupported or missing jurisdictions", async () => {
  let requestCount = 0;
  const fetcher = (async () => {
    requestCount += 1;
    throw new Error("The unsupported registry must not be called.");
  }) as typeof fetch;

  const unsupported = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: "United States" },
    fetcher,
  );
  const missingJurisdiction = await checkInstitutionStatus(
    { institutionName: "Example University", jurisdiction: null },
    fetcher,
  );

  assert.equal(unsupported.status, "UNABLE_TO_CHECK");
  assert.equal(unsupported.sourceName, null);
  assert.equal(unsupported.sourceUrl, null);
  assert.equal(missingJurisdiction.status, "UNABLE_TO_CHECK");
  assert.equal(requestCount, 0);
});