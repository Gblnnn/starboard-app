import resetUserPasswordHandler from "../server/reset-user-password-handler";

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.statusCode = 405;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const authorization = request.headers.authorization;
  const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const headers = new Headers();
  if (authorizationValue) headers.set("authorization", authorizationValue);
  const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  const result = await resetUserPasswordHandler(
    new Request("http://localhost/api/reset-user-password", {
      method: "POST",
      headers,
      body,
    }),
  );

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json");
  response.end(await result.text());
}
