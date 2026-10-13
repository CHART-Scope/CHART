import crypto from "node:crypto";
import http from "node:http";

/**
 * The services behind the Next server: the Python API and Keycloak's token
 * endpoint, as the server-side route handlers reach them.
 *
 * Browser requests are faked with page.route (fakeApi.ts), but a route handler
 * such as /api/setup/bootstrap or /api/auth/keycloak-exchange calls onward
 * from the Next process, where page.route cannot see. playwright.config.ts
 * points CHART_PYTHON_API_INTERNAL_URL and KEYCLOAK_SERVER_URL here so a spec
 * can assert exactly what the web server forwarded.
 */

export const upstreamPort = Number(process.env.E2E_UPSTREAM_PORT ?? 3301);

export type UpstreamRequest = {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

type Reply = { status: number; body: unknown };
type Handler = (request: UpstreamRequest) => Reply;

export type FakeUpstream = {
  requests: UpstreamRequest[];
  /** Answer one method + path. Later registrations win. */
  on: (method: string, path: string | RegExp, handler: Handler) => void;
  /** Accept `code` at the token endpoint only with the verifier for `challenge`. */
  issueCode: (code: string, challenge: string) => void;
  reset: () => void;
  close: () => Promise<void>;
};

export async function startFakeUpstream(): Promise<FakeUpstream> {
  const requests: UpstreamRequest[] = [];
  let handlers: [string, string | RegExp, Handler][] = [];
  const codes = new Map<string, string>();

  const server = http.createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const request: UpstreamRequest = {
        method: incoming.method ?? "GET",
        path: new URL(incoming.url ?? "/", "http://upstream").pathname,
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(request);
      const reply = answer(request);
      outgoing.writeHead(reply.status, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(reply.body));
    });
  });

  function answer(request: UpstreamRequest): Reply {
    if (request.path.endsWith("/protocol/openid-connect/token")) {
      return tokenReply(new URLSearchParams(request.body));
    }
    const match = [...handlers]
      .reverse()
      .find(
        ([method, path]) =>
          method === request.method &&
          (typeof path === "string" ? path === request.path : path.test(request.path)),
      );
    return match
      ? match[2](request)
      : { status: 404, body: { error: "E2E_UNHANDLED" } };
  }

  function tokenReply(form: URLSearchParams): Reply {
    const code = form.get("code") ?? "";
    const challenge = codes.get(code);
    const verifier = form.get("code_verifier") ?? "";
    if (
      form.get("grant_type") !== "authorization_code" ||
      !challenge ||
      sha256Base64Url(verifier) !== challenge
    ) {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    codes.delete(code);
    return {
      status: 200,
      body: {
        access_token: `access-${code}`,
        refresh_token: `refresh-${code}`,
        id_token: `id-${code}`,
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: "Bearer",
      },
    };
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(upstreamPort, "127.0.0.1", resolve);
  });

  return {
    requests,
    on: (method, path, handler) => handlers.push([method, path, handler]),
    issueCode: (code, challenge) => codes.set(code, challenge),
    reset: () => {
      requests.length = 0;
      handlers = [];
      codes.clear();
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function sha256Base64Url(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}
