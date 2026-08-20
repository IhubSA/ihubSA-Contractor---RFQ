import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// BulkSMS.com JSON API v1 (api.bulksms.com) — the bulksms.co.za account uses
// the same global API. Prefer a dedicated API token (Settings > API tokens
// in the BulkSMS dashboard) over the main account username/password, since
// a token can be revoked/rotated without changing the account login.
// Supports either BULKSMS_TOKEN_ID/BULKSMS_TOKEN_SECRET (token auth) or
// BULKSMS_USERNAME/BULKSMS_PASSWORD (account auth) — whichever pair is set.
const BULKSMS_TOKEN_ID = Deno.env.get("BULKSMS_TOKEN_ID");
const BULKSMS_TOKEN_SECRET = Deno.env.get("BULKSMS_TOKEN_SECRET");
const BULKSMS_USERNAME = Deno.env.get("BULKSMS_USERNAME");
const BULKSMS_PASSWORD = Deno.env.get("BULKSMS_PASSWORD");

const SITE_URL = "https://ihubsa.github.io/ihubSA-Contractor---RFQ/";
const FROM_ADDRESS = "RFQ Hub <noreply@public-rfq-hub.co.za>";
const BATCH_SIZE = 90; // Resend's batch endpoint caps at 100 per request
const SMS_BATCH_SIZE = 400; // conservative cap on recipients per BulkSMS "to" array per request

const KNOWN_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "Northern Cape", "North West", "Western Cape",
];

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Normalises a South African mobile number to E.164 (+27...) for BulkSMS.
// Accepts common local formats: "082 123 4567", "0821234567",
// "+27821234567", "27821234567". Returns null if it doesn't look like a
// plausible SA mobile number, so callers can skip it rather than send a
// request that BulkSMS would reject.
function normalizeSAPhone(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("+27")) {
    n = n.slice(1);
  } else if (n.startsWith("0")) {
    n = "27" + n.slice(1);
  } else if (n.startsWith("27")) {
    // already in national-without-plus form
  } else {
    return null;
  }
  // SA mobile numbers are 11 digits total in "27XXXXXXXXX" form.
  if (!/^27\d{9}$/.test(n)) return null;
  return "+" + n;
}

async function sendBulkSms(recipients: string[], body: string): Promise<{ ok: boolean; error?: string }> {
  const hasToken = BULKSMS_TOKEN_ID && BULKSMS_TOKEN_SECRET;
  const hasPassword = BULKSMS_USERNAME && BULKSMS_PASSWORD;
  if (!hasToken && !hasPassword) {
    return { ok: false, error: "SMS sending is not configured (missing BulkSMS credentials)" };
  }
  const authUser = hasToken ? BULKSMS_TOKEN_ID! : BULKSMS_USERNAME!;
  const authPass = hasToken ? BULKSMS_TOKEN_SECRET! : BULKSMS_PASSWORD!;
  const basicAuth = "Basic " + btoa(`${authUser}:${authPass}`);

  for (const batch of chunk(recipients, SMS_BATCH_SIZE)) {
    const resp = await fetch("https://api.bulksms.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": basicAuth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: batch, body }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[notify-suppliers-new-rfq] BulkSMS error:", resp.status, errText);
      return { ok: false, error: `BulkSMS request failed (${resp.status})` };
    }
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("[notify-suppliers-new-rfq] missing RESEND_API_KEY secret");
      return json({ error: "Email sending is not configured (missing RESEND_API_KEY secret)" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    // Client scoped to the caller's own JWT — used for identity + membership checks.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const caller = userData.user;

    const body = await req.json().catch(() => ({}));
    const { rfqId, additionalProvinces } = body as { rfqId?: string; additionalProvinces?: string[] };

    if (!rfqId) {
      return json({ error: "rfqId is required" }, 400);
    }

    // Service-role client — only used after the authorization checks below pass.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: rfq, error: rfqErr } = await adminClient
      .from("rfqs")
      .select("id, rfq_name, project_name, description, deadline, company_id, is_public, is_withdrawn, provinces, location_area, supplier_notification_sent, sms_notification_sent, notified_provinces")
      .eq("id", rfqId)
      .maybeSingle();

    if (rfqErr || !rfq) {
      return json({ error: "RFQ not found" }, 404);
    }

    if (!rfq.is_public) {
      return json({ error: "This RFQ isn't public — nothing to notify suppliers about" }, 400);
    }

    if (rfq.is_withdrawn) {
      return json({ error: "This RFQ has been unpublished — nothing to notify suppliers about" }, 400);
    }

    const { data: superAdminRow } = await callerClient
      .from("super_admins")
      .select("email")
      .eq("email", caller.email)
      .maybeSingle();
    const isSuperAdmin = !!superAdminRow;

    if (!isSuperAdmin) {
      const { data: membership } = await callerClient
        .from("company_members")
        .select("company_id")
        .eq("user_id", caller.id)
        .eq("company_id", rfq.company_id)
        .maybeSingle();
      if (!membership) {
        return json({ error: "You can only notify suppliers for your own company's RFQs" }, 403);
      }
    }

    const currentlyNotified: string[] = Array.isArray(rfq.notified_provinces) ? rfq.notified_provinces : [];

    // "Expand Supplier Search": staff explicitly picked additional provinces
    // to notify (e.g. the original province isn't producing enough
    // applications). This is a separate mode from the initial publish
    // notification below — it's not gated by supplier_notification_sent /
    // sms_notification_sent (those track only the original send) and only
    // ever targets suppliers in the newly-requested provinces, never
    // suppliers who chose "ALL" (they were already covered by the initial
    // send) or provinces already in notified_provinces (never re-notify).
    const isExpandRequest = Array.isArray(additionalProvinces) && additionalProvinces.length > 0;

    let targetProvinces: string[] = [];
    if (isExpandRequest) {
      const requested = (additionalProvinces as string[]).filter((p) => KNOWN_PROVINCES.includes(p));
      targetProvinces = requested.filter((p) => !currentlyNotified.includes(p));
      if (targetProvinces.length === 0) {
        return json({ success: true, sent: 0, smsSent: 0, alreadyNotified: true });
      }
    } else {
      // Email and SMS are tracked independently so a retry (or a first send
      // where only one channel was configured) can still complete whichever
      // channel hasn't gone out yet, instead of being blocked by the other.
      const emailAlreadySent = !!rfq.supplier_notification_sent;
      const smsAlreadySent = !!rfq.sms_notification_sent;
      if (emailAlreadySent && smsAlreadySent) {
        return json({ success: true, sent: 0, smsSent: 0, alreadySent: true });
      }
      targetProvinces = Array.isArray(rfq.provinces) ? rfq.provinces : [];
    }

    const emailAlreadySent = !isExpandRequest && !!rfq.supplier_notification_sent;
    const smsAlreadySent = !isExpandRequest && !!rfq.sms_notification_sent;

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", rfq.company_id)
      .maybeSingle();
    const companyName = company?.name || "RFQ Hub";

    // Initial send: suppliers who opted into any of this RFQ's provinces
    // specifically, or into every province ('ALL'). Suppliers with no
    // province set yet (pre-dates this feature, or just haven't visited
    // their preferences link) are deliberately excluded rather than
    // defaulted to "ALL".
    // Expand-search send: exact province match only (across every requested
    // province) — "ALL" suppliers were already reached by the initial send,
    // so they're never re-queried here.
    let supplierQuery = adminClient
      .from("applicant_registrations")
      .select("email, full_name, phone, preferences_token");
    supplierQuery = isExpandRequest
      ? supplierQuery.in("province", targetProvinces)
      : supplierQuery.or([...targetProvinces.map((p) => `province.eq.${p}`), "province.eq.ALL"].join(","));

    const { data: suppliers, error: supErr } = await supplierQuery;

    if (supErr) {
      console.error("[notify-suppliers-new-rfq] supplier lookup error:", supErr);
      return json({ error: "Failed to look up suppliers" }, 500);
    }

    const deadlineText = rfq.deadline
      ? new Date(rfq.deadline).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
      : null;
    const locationText = [rfq.location_area, ...(Array.isArray(rfq.provinces) ? rfq.provinces : [])].filter(Boolean).join(", ");
    const viewLink = `${SITE_URL}?open=${rfq.id}`;

    let totalSent = 0;
    let emailError: string | null = null;
    let emailSucceededThisCall = false;

    if (isExpandRequest || !emailAlreadySent) {
      const emails = (suppliers || [])
        .filter((s) => s && s.email)
        .map((s) => {
          const prefsLink = `${SITE_URL}?prefs=${s.preferences_token}`;
          const html = `
            <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1A1A1A;">
              <h2 style="color: #0F3557;">A new opportunity matching your province is open</h2>
              <p><strong>${escapeHtml(companyName)}</strong> has just posted a new Request for Quotation:</p>
              <p style="font-size: 18px; font-weight: bold; margin: 4px 0;">${escapeHtml(rfq.rfq_name)}</p>
              <p style="color: #555; margin: 4px 0 16px 0;">Project: ${escapeHtml(rfq.project_name)}</p>
              <p>${escapeHtml(rfq.description)}</p>
              ${locationText ? `<p><strong>Location:</strong> ${escapeHtml(locationText)}</p>` : ""}
              ${deadlineText ? `<p><strong>Submission deadline:</strong> ${deadlineText}</p>` : ""}
              <p style="margin: 30px 0;">
                <a href="${viewLink}" style="background: #F57C00; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">View Opportunity &amp; Apply</a>
              </p>
              <p style="color: #888; font-size: 12px;">Or copy this link: ${viewLink}</p>
              <hr style="border:none; border-top:1px solid #eee; margin:30px 0 16px 0;">
              <p style="color: #999; font-size: 11px;">You're receiving this because you registered as a supplier on RFQ Hub. <a href="${prefsLink}" style="color:#999;">Update your province / notification preferences</a>.</p>
            </div>
          `;
          return {
            from: FROM_ADDRESS,
            to: s.email,
            subject: `New opportunity: ${rfq.rfq_name} (${companyName})`,
            html,
          };
        });

      if (emails.length === 0) {
        emailSucceededThisCall = true;
        if (!isExpandRequest) {
          await adminClient.from("rfqs").update({ supplier_notification_sent: true }).eq("id", rfqId);
        }
      } else {
        let batchFailed = false;
        for (const batch of chunk(emails, BATCH_SIZE)) {
          const resendResp = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batch),
          });
          const resendResult = await resendResp.json().catch(() => ({}));
          if (!resendResp.ok) {
            console.error("[notify-suppliers-new-rfq] resend error:", JSON.stringify(resendResult));
            emailError = resendResult?.message || "Failed to send some emails via Resend";
            batchFailed = true;
            break; // best-effort across batches: stop rather than keep spending on a failing provider
          }
          totalSent += batch.length;
        }
        if (!batchFailed) {
          emailSucceededThisCall = true;
          if (!isExpandRequest) {
            await adminClient.from("rfqs").update({ supplier_notification_sent: true }).eq("id", rfqId);
          }
        }
      }
    }

    // SMS is best-effort and isolated from the email flow above — a BulkSMS
    // outage or misconfiguration must never prevent (or roll back) the email
    // notifications suppliers already rely on.
    let totalSmsSent = 0;
    let smsError: string | null = null;
    let smsSucceededThisCall = false;
    if (isExpandRequest || !smsAlreadySent) {
      try {
        const smsRecipients = (suppliers || [])
          .map((s) => normalizeSAPhone(s.phone))
          .filter((n): n is string => !!n);

        if (smsRecipients.length === 0) {
          smsSucceededThisCall = true;
          if (!isExpandRequest) {
            await adminClient.from("rfqs").update({ sms_notification_sent: true }).eq("id", rfqId);
          }
        } else {
          const smsBody = `New opportunity on CNWE Procurement Hub: ${rfq.rfq_name} (${companyName}). View & apply: ${viewLink}`;
          const result = await sendBulkSms(smsRecipients, smsBody);
          if (result.ok) {
            totalSmsSent = smsRecipients.length;
            smsSucceededThisCall = true;
            if (!isExpandRequest) {
              await adminClient.from("rfqs").update({ sms_notification_sent: true }).eq("id", rfqId);
            }
          } else {
            smsError = result.error || "Failed to send SMS notifications";
            console.error("[notify-suppliers-new-rfq] SMS not sent:", smsError);
          }
        }
      } catch (smsErr) {
        smsError = smsErr instanceof Error ? smsErr.message : "Unknown SMS error";
        console.error("[notify-suppliers-new-rfq] SMS UNCAUGHT:", smsErr instanceof Error ? smsErr.stack : smsErr);
      }
    }

    // Record which provinces are now covered — as long as at least one
    // channel actually got the message out (or there was nothing to send)
    // for this call's target province(s), same "mark as attempted, not as
    // confirmed-delivered" discipline as the two boolean flags above.
    if ((emailSucceededThisCall || smsSucceededThisCall) && targetProvinces.length > 0) {
      const updatedProvinces = Array.from(new Set([...currentlyNotified, ...targetProvinces]));
      await adminClient.from("rfqs").update({ notified_provinces: updatedProvinces }).eq("id", rfqId);
    }

    if ((emailError || smsError) && totalSent === 0 && totalSmsSent === 0) {
      // Nothing went out on either channel — surface this as a real failure
      // so the caller's toast/error handling reflects it, same as before
      // SMS existed.
      return json({ error: emailError || smsError, sent: totalSent, smsSent: totalSmsSent, emailError, smsError }, 502);
    }

    return json({ success: true, sent: totalSent, smsSent: totalSmsSent, emailError, smsError });
  } catch (err) {
    console.error("[notify-suppliers-new-rfq] UNCAUGHT:", err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
