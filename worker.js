// Cloudflare Worker: receives the login event from your page, adds the visitor's
// IP + location (from Cloudflare), and forwards it to your Telegram bot.
//
// Settings → Variables and Secrets (add as "Secret"):
//   BOT_TOKEN       your bot token from @BotFather
//   CHAT_ID         your numeric chat id
// Optional (plain variable):
//   ALLOWED_ORIGIN  your site's origin, e.g. https://yoursite.com  (no trailing slash)

const clean = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);

function formatMessage(i, geo) {
  const ok = i.event === "login_success";
  const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ");
  const lines = [
    ok ? "✅ Successful login" : "❌ Failed login attempt",
    (ok ? "👤 User: " : "👤 Username tried: ") + clean(i.user, 60),
    "🕒 Time: " + clean(i.local, 40) + (i.tz ? " (" + clean(i.tz, 40) + ")" : "") + " | UTC " + clean(i.utc, 25),
    "🌐 IP: " + (geo.ip || "unknown"),
    "📍 Location: " + (place || "unknown"),
    geo.org ? "🏢 Network: " + geo.org + (geo.asn ? " (AS" + geo.asn + ")" : "") : "",
    "📱 Device: " + clean(i.type, 20) + " | " + clean(i.os, 30) + (i.model ? " | " + clean(i.model, 40) : ""),
    "🧭 Browser: " + clean(i.browser, 40),
    "🖥 Screen: " + clean(i.screen, 30) + " (viewport " + clean(i.viewport, 20) + (i.touch ? ", touch" : "") + ")",
    "🗣 Language: " + clean(i.lang, 20),
    "🔗 Referrer: " + clean(i.referrer, 200),
    "📄 Page: " + clean(i.page, 200)
  ];
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    // If ALLOWED_ORIGIN is set, reject calls coming from other sites.
    const origin = request.headers.get("Origin");
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    const info = await request.json().catch(() => null);
    if (!info || !["login_success", "login_failed"].includes(info.event)) {
      return new Response("Bad request", { status: 400, headers: cors });
    }

    const cf = request.cf || {};
    const geo = {
      ip: request.headers.get("CF-Connecting-IP"),
      city: cf.city,
      region: cf.region,
      country: cf.country,
      org: cf.asOrganization,
      asn: cf.asn
    };

    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: formatMessage(info, geo),
        disable_web_page_preview: true
      })
    });

    return new Response(res.ok ? "ok" : "telegram error", { status: res.ok ? 200 : 502, headers: cors });
  }
};
