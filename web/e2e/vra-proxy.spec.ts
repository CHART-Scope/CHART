import { expect, test } from "@playwright/test";

import { type FakeUpstream, startFakeUpstream } from "./support/fakeUpstream";

// The Next route handlers in front of the VRA API (src/app/api/chart/vra),
// called over HTTP on the real build with the Python API replaced by a
// stand-in that records what arrived. They must pass the caller's token, the
// CSV upload (body, content type and file name) and the CSV template through
// untouched, and hand the API's refusals back as they came.

let upstream: FakeUpstream;
test.beforeAll(async () => {
  upstream = await startFakeUpstream();
});
test.afterAll(async () => {
  await upstream.close();
});
test.beforeEach(() => upstream.reset());

const FRAME = "geo-in-madhya-pradesh";
const auth = { authorization: "Bearer e2e-vra-token" };
const header =
  "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes";

test("every VRA route reaches its API path with the caller's token", async ({
  request,
}) => {
  const reads = [
    ["/api/chart/vra/indicators", "/vra/indicators"],
    [`/api/chart/vra/${FRAME}/assessment`, `/vra/${FRAME}/assessment`],
    [`/api/chart/vra/${FRAME}/map`, `/vra/${FRAME}/map`],
    [
      `/api/chart/vra/${FRAME}/areas/geo-in-madhya-pradesh-division-rewa`,
      `/vra/${FRAME}/areas/geo-in-madhya-pradesh-division-rewa`,
    ],
    [`/api/chart/vra/${FRAME}/coverage`, `/vra/${FRAME}/coverage`],
  ] as const;
  for (const [, path] of reads)
    upstream.on("GET", path, () => ({ status: 200, body: { path } }));
  upstream.on("POST", `/vra/${FRAME}/runs`, () => ({
    status: 200,
    body: { ran: true },
  }));

  for (const [route, path] of reads) {
    const response = await request.get(route, { headers: auth });
    expect(response.status(), route).toBe(200);
    expect(await response.json()).toEqual({ path });
  }
  const run = await request.post(`/api/chart/vra/${FRAME}/runs`, { headers: auth });
  expect(await run.json()).toEqual({ ran: true });

  expect(upstream.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
    ...reads.map(([, path]) => `GET ${path}`),
    `POST /vra/${FRAME}/runs`,
  ]);
  for (const forwarded of upstream.requests)
    expect(forwarded.headers.authorization).toBe(auth.authorization);
});

test("CSV goes through both ways: the template down, an upload up", async ({
  request,
}) => {
  const template = `${header}\nbhopal,Bhopal Division,exp.population_density,,,,,\n`;
  upstream.on("GET", `/vra/${FRAME}/template.csv`, () => ({
    status: 200,
    body: template,
    contentType: "text/csv; charset=utf-8",
  }));
  upstream.on("POST", `/vra/${FRAME}/values`, () => ({
    status: 200,
    body: {
      ingestion_id: 7,
      status: "completed",
      rows_accepted: 1,
      rows_rejected: 1,
      rejections: [{ row: 3, reason: "vintage is required" }],
    },
  }));

  const download = await request.get(`/api/chart/vra/${FRAME}/template.csv`, {
    headers: auth,
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(await download.text()).toBe(template);

  const csv = `${header}\nbhopal,Bhopal Division,exp.population_density,412.5,2011,Census of India 2011,,\nrewa,Rewa Division,sens.elderly_share,6.1,,,,\n`;
  const upload = await request.post(
    `/api/chart/vra/${FRAME}/values?file_name=mp%20values.csv`,
    { headers: { ...auth, "content-type": "text/csv" }, data: csv },
  );
  expect(upload.status()).toBe(200);
  expect((await upload.json()).rejections).toEqual([
    { row: 3, reason: "vintage is required" },
  ]);

  const sent = upstream.requests.find((r) => r.method === "POST");
  expect(sent?.path).toBe(`/vra/${FRAME}/values`);
  expect(new URLSearchParams(sent?.search).get("file_name")).toBe("mp values.csv");
  expect(sent?.headers["content-type"]).toBe("text/csv");
  expect(sent?.headers.authorization).toBe(auth.authorization);
  expect(sent?.body).toBe(csv);
});

test("the API's refusals reach the browser unchanged", async ({ request }) => {
  upstream.on("GET", `/vra/${FRAME}/coverage`, () => ({
    status: 403,
    body: { error: "FORBIDDEN" },
  }));
  upstream.on("POST", `/vra/${FRAME}/values`, () => ({
    status: 403,
    body: { error: "FORBIDDEN" },
  }));
  upstream.on("GET", "/vra/geo-ke/assessment", () => ({
    status: 403,
    body: { error: "GEOGRAPHY_OUT_OF_SCOPE" },
  }));

  const coverage = await request.get(`/api/chart/vra/${FRAME}/coverage`, {
    headers: auth,
  });
  expect(coverage.status()).toBe(403);
  expect(await coverage.json()).toEqual({ error: "FORBIDDEN" });

  const upload = await request.post(`/api/chart/vra/${FRAME}/values?file_name=x.csv`, {
    headers: { ...auth, "content-type": "text/csv" },
    data: `${header}\n`,
  });
  expect(upload.status()).toBe(403);

  const kenya = await request.get("/api/chart/vra/geo-ke/assessment", {
    headers: auth,
  });
  expect(kenya.status()).toBe(403);
  expect(await kenya.json()).toEqual({ error: "GEOGRAPHY_OUT_OF_SCOPE" });

  // Without a token nothing is invented on the way: the API sees none.
  upstream.on("GET", `/vra/${FRAME}/assessment`, () => ({
    status: 401,
    body: { error: "AUTH_REQUIRED" },
  }));
  const anonymous = await request.get(`/api/chart/vra/${FRAME}/assessment`);
  expect(anonymous.status()).toBe(401);
  expect(upstream.requests.at(-1)?.headers.authorization).toBeUndefined();
});
