import { createClient } from "@supabase/supabase-js";

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

const sendJson = (response: ApiResponse, status: number, body: Record<string, string>) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const RESET_PASSWORD = "SoharStar";
const USERS_PER_PAGE = 1000;

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
      sendJson(response, 500, { error: "Password reset is not configured on the server." });
      return;
    }

    const authorization = request.headers.authorization;
    const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;
    const accessToken = authorizationValue?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      sendJson(response, 401, { error: "Sign in as an administrator to reset passwords." });
      return;
    }

    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      sendJson(response, 400, { error: "Invalid request body." });
      return;
    }

    const userIdValue = (request.body as Record<string, unknown>).userId;
    const userId =
      typeof userIdValue === "string" || typeof userIdValue === "number"
        ? String(userIdValue).trim()
        : "";
    if (!userId) {
      sendJson(response, 400, { error: "Select a user before resetting the password." });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || "https://layonfapjyiupkjdswbj.supabase.co";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user?.email) {
      sendJson(response, 401, { error: "Your session is invalid or expired. Sign in again." });
      return;
    }

    const { data: adminRows, error: adminError } = await supabase
      .from("users")
      .select("role")
      .eq("email", authData.user.email)
      .limit(1);
    if (adminError) throw adminError;
    if (!adminRows?.some((row) => row.role === "admin")) {
      sendJson(response, 403, { error: "Only administrators can reset user passwords." });
      return;
    }

    const { data: targetRows, error: targetError } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .limit(1);
    if (targetError) throw targetError;
    const targetEmail = targetRows?.[0]?.email;
    if (typeof targetEmail !== "string" || !targetEmail.trim()) {
      sendJson(response, 404, { error: "The selected user could not be found." });
      return;
    }

    const normalizedTargetEmail = targetEmail.trim().toLowerCase();
    for (let page = 1; ; page += 1) {
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });
      if (listError) throw listError;

      const targetAuthUser = authUsers.users.find(
        (user) => user.email?.trim().toLowerCase() === normalizedTargetEmail,
      );
      if (targetAuthUser) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(targetAuthUser.id, {
          password: RESET_PASSWORD,
        });
        if (updateError) throw updateError;
        sendJson(response, 200, { message: "User password reset." });
        return;
      }

      if (authUsers.users.length < USERS_PER_PAGE) break;
    }

    sendJson(response, 404, { error: "No Auth account was found for the selected user." });
  } catch (error) {
    console.error("Vercel reset-user-password request failed:", error);
    sendJson(response, 500, { error: "Unable to reset the user password due to a server error." });
  }
}
