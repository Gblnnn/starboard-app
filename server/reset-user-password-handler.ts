import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://layonfapjyiupkjdswbj.supabase.co";
const RESET_PASSWORD = "SoharStar";
const USERS_PER_PAGE = 1000;

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async function resetUserPasswordHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured for the reset-user-password function.");
    return jsonResponse({ error: "Password reset is not configured on the server." }, 500);
  }

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return jsonResponse({ error: "Sign in as an administrator to reset passwords." }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }
    payload = body as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const userId =
    typeof payload.userId === "string" || typeof payload.userId === "number"
      ? String(payload.userId).trim()
      : "";
  if (!userId) {
    return jsonResponse({ error: "Select a user before resetting the password." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user?.email) {
      return jsonResponse({ error: "Your session is invalid or expired. Sign in again." }, 401);
    }

    const { data: adminRows, error: adminError } = await supabase
      .from("users")
      .select("role")
      .eq("email", authData.user.email)
      .limit(1);
    if (adminError) throw adminError;
    if (!adminRows?.some((row) => row.role === "admin")) {
      return jsonResponse({ error: "Only administrators can reset user passwords." }, 403);
    }

    const { data: targetRows, error: targetError } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .limit(1);
    if (targetError) throw targetError;
    const targetEmail = targetRows?.[0]?.email;
    if (typeof targetEmail !== "string" || !targetEmail.trim()) {
      return jsonResponse({ error: "The selected user could not be found." }, 404);
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
        return jsonResponse({ message: "User password reset." }, 200);
      }

      if (authUsers.users.length < USERS_PER_PAGE) break;
    }

    return jsonResponse({ error: "No Auth account was found for the selected user." }, 404);
  } catch (error) {
    console.error("Reset-user-password function failed:", error);
    return jsonResponse({ error: "Unable to reset the user password due to a server error." }, 500);
  }
}
