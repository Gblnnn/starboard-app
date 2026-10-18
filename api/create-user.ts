import createUserHandler from "../server/create-user-handler";

interface ApiRequest {
  method?: string;
  url?: string;
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
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  try {
    const headers = new Headers({
      "Content-Type": String(request.headers["content-type"] || "application/json"),
    });
    const authorization = request.headers.authorization;
    if (authorization) {
      headers.set(
        "Authorization",
        Array.isArray(authorization) ? authorization.join(", ") : authorization,
      );
    }

    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    const functionRequest = new Request(
      new URL(request.url || "/api/create-user", "http://localhost"),
      { method: "POST", headers, body },
    );
    const functionResponse = await createUserHandler(functionRequest);

    response.statusCode = functionResponse.status;
    functionResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(await functionResponse.text());
  } catch (error) {
    console.error("Vercel create-user route failed:", error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Unable to create user due to a server error." }));
  }
}
