import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = "https://ihubsa.github.io/ihubSA-Contractor---RFQ/";
const FROM_ADDRESS = "RFQ Hub <noreply@public-rfq-hub.co.za>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    // Client scoped to the caller's own JWT — used to identify them and
    // check their own super_admins row under normal RLS.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const caller = userData.user;

    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json({ error: "A valid email is required" }, 400);
    }
    const targetEmail = email.trim().toLowerCase();

    // Only an admin-manager (Brent's account, per his explicit choice --
    // see super_admins.can_manage_admins) may invite new super admins,
    // even though every super admin otherwise has full platform access.
    const { data: callerRow } = await callerClient
      .from("super_admins")
      .select("can_manage_admins")
      .eq("email", caller.email)
      .maybeSingle();

    if (!callerRow?.can_manage_admins) {
      return json({ error: "Only the platform owner can invite super admins" }, 403);
    }

    // Service-role client — only used after the authorization check above passes.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: existingRow } = await adminClient
      .from("super_admins")
      .select("email")
      .eq("email", targetEmail)
      .maybeSingle();

    if (existingRow) {
      return json({ success: true, alreadyAdmin: true });
    }

    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(targetEmail, {
      data: { invited_super_admin: true },
      redirectTo: SITE_URL,
    });

    // If this email already has an auth.users account (e.g. an existing
    // company owner/staff member), inviteUserByEmail fails since there's
    // no new account to create or password to set -- fall back to just
    // granting access directly and notifying them by plain email instead
    // of a "set your password" link, since they already have one.
    const alreadyRegistered = !!inviteErr && /already.*registered|already.*exist/i.test(inviteErr.message || "");

    if (inviteErr && !alreadyRegistered) {
      return json({ error: inviteErr.message }, 400);
    }

    const { error: insertErr } = await adminClient
      .from("super_admins")
      .insert([{ email: targetEmail, can_manage_admins: false, invited_by: caller.email }]);

    if (insertErr) {
      console.error("[invite-super-admin] insert error:", insertErr);
      return json({ error: "Failed to grant super admin access" }, 500);
    }

    if (alreadyRegistered) {
      if (RESEND_API_KEY) {
        const html = `
          <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1A1A1A;">
            <h2 style="color: #0F3557;">You've been granted Super Admin access</h2>
            <p>${escapeHtml(caller.email)} has added you as a Super Admin on the RFQ Hub platform. Since you already have an account, no new password is needed -- just log in as usual.</p>
            <p style="margin: 30px 0;">
              <a href="${SITE_URL}" style="background: #F57C00; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">Log In</a>
            </p>
            <p style="color: #888; font-size: 12px;">Or copy this link: ${SITE_URL}</p>
          </div>
        `;
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_ADDRESS,
              to: targetEmail,
              subject: "You've been granted Super Admin access",
              html,
            }),
          });
        } catch (mailErr) {
          // Best-effort: the admin grant itself already succeeded above,
          // so a notification-email failure shouldn't be reported as a
          // failure of the whole operation.
          console.error("[invite-super-admin] notification email failed:", mailErr);
        }
      }
      return json({ success: true, existingAccount: true });
    }

    return json({ success: true });
  } catch (err) {
    console.error("[invite-super-admin] UNCAUGHT:", err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
