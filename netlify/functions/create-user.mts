import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://layonfapjyiupkjdswbj.supabase.co";

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured for the create-user function.");
    return jsonResponse({ error: "User creation is not configured on the server." }, 500);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return jsonResponse({ error: "Sign in as an administrator to create users." }, 401);
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

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const clearance = payload.clearance;
  if (!email.includes("@") || !name || password.length < 6) {
    return jsonResponse({ error: "Enter a valid email, name, and password of at least 6 characters." }, 400);
  }
  if (
    !clearance ||
    typeof clearance !== "object" ||
    Array.isArray(clearance) ||
    !Object.values(clearance).every((enabled) => typeof enabled === "boolean")
  ) {
    return jsonResponse({ error: "Invalid user permissions." }, 400);
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
      return jsonResponse({ error: "Only administrators can create users." }, 403);
    }

    const { data: employeeRows, error: employeeError } = await supabase
      .from("employees")
      .select("name, designation")
      .eq("email", email)
      .limit(1);
    if (employeeError) throw employeeError;
    if (!employeeRows?.length) {
      return jsonResponse({ error: "Cannot create user. Record Master entry is required first." }, 400);
    }

    const { data: existingUsers, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (existingUserError) throw existingUserError;
    if (existingUsers?.length) {
      return jsonResponse({ error: "A user profile with this email already exists." }, 409);
    }

    const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createAuthError) {
      const status = /already|exists/i.test(createAuthError.message) ? 409 : 400;
      return jsonResponse({ error: createAuthError.message }, status);
    }
    if (!createdAuth.user) {
      throw new Error("Supabase Auth did not return the created user.");
    }

    const { error: insertError } = await supabase.from("users").insert({
      name: employeeRows[0].name || name,
      email,
      role: "profile",
      designation: employeeRows[0].designation || "",
      clearance: JSON.stringify(clearance),
      editor: "false",
      sensitive_data: "false",
    });
    if (insertError) {
      const { error: rollbackError } = await supabase.auth.admin.deleteUser(createdAuth.user.id);
      if (rollbackError) {
        console.error("Failed to roll back newly created auth user:", rollbackError);
      }
      console.error("Failed to create user profile:", insertError);
      return jsonResponse(
        {
          error: rollbackError
            ? "The profile could not be saved and the auth account could not be removed. Contact an administrator before retrying."
            : "Unable to save the user profile. Please retry.",
        },
        500,
      );
    }

    return jsonResponse({ message: "User created." }, 201);
  } catch (error) {
    console.error("Create-user function failed:", error);
    return jsonResponse({ error: "Unable to create user due to a server error." }, 500);
  }
};
