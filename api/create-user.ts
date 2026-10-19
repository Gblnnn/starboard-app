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
      sendJson(response, 500, { error: "User creation is not configured on the server." });
      return;
    }

    const authorization = request.headers.authorization;
    const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;
    const accessToken = authorizationValue?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      sendJson(response, 401, { error: "Sign in as an administrator to create users." });
      return;
    }

    const payload = request.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      sendJson(response, 400, { error: "Invalid request body." });
      return;
    }

    const values = payload as Record<string, unknown>;
    const employeeId =
      typeof values.employeeId === "string" || typeof values.employeeId === "number"
        ? String(values.employeeId).trim()
        : "";
    const password = typeof values.password === "string" ? values.password : "";
    const clearance = values.clearance;
    if (!employeeId || password.length < 6) {
      sendJson(response, 400, { error: "Select an employee and provide a password of at least 6 characters." });
      return;
    }
    if (
      !clearance ||
      typeof clearance !== "object" ||
      Array.isArray(clearance) ||
      !Object.values(clearance).every((enabled) => typeof enabled === "boolean")
    ) {
      sendJson(response, 400, { error: "Invalid user permissions." });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || "https://layonfapjyiupkjdswbj.supabase.co";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user?.email) {
      sendJson(response, 401, { error: authError?.message || "Your session is invalid or expired. Sign in again." });
      return;
    }

    const { data: adminRows, error: adminError } = await supabase
      .from("users")
      .select("role")
      .eq("email", authData.user.email)
      .limit(1);
    if (adminError) throw adminError;
    if (!adminRows?.some((row) => row.role === "admin")) {
      sendJson(response, 403, { error: "Only administrators can create users." });
      return;
    }

    const { data: employeeRows, error: employeeError } = await supabase
      .from("employees")
      .select("email, emp_id")
      .eq("id", employeeId)
      .limit(1);
    if (employeeError) throw employeeError;
    if (!employeeRows?.length) {
      sendJson(response, 404, { error: "The selected employee could not be found." });
      return;
    }

    const employee = employeeRows[0];
    const email = typeof employee.email === "string" ? employee.email.trim().toLowerCase() : "";
    if (!email.includes("@")) {
      sendJson(response, 400, { error: "Add a valid email address to the employee record before creating a user." });
      return;
    }

    const { data: existingUsers, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (existingUserError) throw existingUserError;
    if (existingUsers?.length) {
      sendJson(response, 409, { error: "A user profile with this email already exists." });
      return;
    }

    const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createAuthError) {
      const status = /already|exists/i.test(createAuthError.message) ? 409 : 400;
      sendJson(response, status, { error: createAuthError.message });
      return;
    }
    if (!createdAuth.user) {
      throw new Error("Supabase Auth did not return the created user.");
    }

    const { error: insertError } = await supabase.from("users").insert({
      email,
      emp_id: employee.emp_id ?? null,
      role: "profile",
      clearance: JSON.stringify(clearance),
      editor: "false",
      sensitive_data: "false",
    });
    if (insertError) {
      const { error: rollbackError } = await supabase.auth.admin.deleteUser(createdAuth.user.id);
      if (rollbackError) console.error("Failed to roll back newly created auth user:", rollbackError);
      console.error("Failed to insert user profile:", insertError);
      const databaseError = [
        insertError.message,
        insertError.code ? `code ${insertError.code}` : "",
        insertError.details || "",
        insertError.hint ? `Hint: ${insertError.hint}` : "",
      ].filter(Boolean).join(" — ");
      sendJson(
        response,
        500,
        {
          error: rollbackError
            ? `The profile could not be saved and the auth account could not be removed. Contact an administrator before retrying. Database error: ${databaseError}`
            : `Unable to save the user profile. Database error: ${databaseError}`,
        },
      );
      return;
    }

    sendJson(response, 201, { message: "User created." });
  } catch (error) {
    console.error("Vercel create-user request failed:", error);
    sendJson(
      response,
      500,
      { error: error instanceof Error ? error.message : "Unable to create user due to a server error." },
    );
  }
}
