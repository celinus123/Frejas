import http2 from "node:http2";
import crypto from "node:crypto";

/**
 * Sends notifications to iPhones through Apple's push service. Server only.
 * Needs three settings on the server: APNS_KEY (the text of the .p8 key file), APNS_KEY_ID and APNS_TEAM_ID.
 * Without them nothing is sent and everything else keeps working.
 */
const TOPIC = "app.frejas";   // the app's bundle id
const HOST = () => process.env.APNS_HOST ?? "https://api.push.apple.com";

export const apnsConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);

// Apple wants a signed pass that is at most an hour old; one is kept for 40 minutes.
let pass: { jwt: string; at: number } | null = null;
function bearer(): string {
  const now = Math.floor(Date.now() / 1000);
  if (pass && now - pass.at < 2400) return pass.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "ES256", kid: process.env.APNS_KEY_ID })}.${b64({ iss: process.env.APNS_TEAM_ID, iat: now })}`;
  const key = (process.env.APNS_KEY ?? "").replace(/\\n/g, "\n");   // a key pasted on one line keeps working
  const sig = crypto.sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  pass = { jwt: `${head}.${sig}`, at: now };
  return pass.jwt;
}

export interface Note { title: string; body: string; url: string }

/** Sends one notification to each phone. `gone` lists phones Apple says no longer have the app, so they can be forgotten. */
export async function sendApns(tokens: string[], note: Note): Promise<{ sent: number; gone: string[]; problems: string[] }> {
  if (!apnsConfigured() || !tokens.length) return { sent: 0, gone: [], problems: [] };
  let auth: string;
  try { auth = `bearer ${bearer()}`; } catch (e) { return { sent: 0, gone: [], problems: [`the push key can't be read: ${(e as Error).message}`] }; }
  const payload = JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: "default" }, url: note.url });
  const client = http2.connect(HOST());
  client.on("error", () => { /* each request below reports its own failure */ });
  const problems: string[] = [];
  const said = (status: number, text: string) => { let why = ""; try { why = (JSON.parse(text) as { reason?: string }).reason ?? ""; } catch { /* no reason given */ } return `${status || "no answer"}${why ? ` ${why}` : ""}`; };
  const one = (token: string) => new Promise<"sent" | "gone" | "failed">((resolve) => {
    let status = 0, text = "";
    const timer = setTimeout(() => { req.close(); problems.push("no answer from Apple"); resolve("failed"); }, 8000);
    const req = client.request({
      ":method": "POST", ":path": `/3/device/${token}`, authorization: auth,
      "apns-topic": TOPIC, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json",
    });
    req.on("response", (h) => { status = Number(h[":status"]); });
    req.on("data", (d) => { text += d; });
    req.on("end", () => { clearTimeout(timer); if (status !== 200) problems.push(said(status, text)); resolve(status === 200 ? "sent" : status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text) ? "gone" : "failed"); });
    req.on("error", (e) => { clearTimeout(timer); problems.push(`connection: ${e.message}`); resolve("failed"); });
    req.end(payload);
  });
  try {
    const results = await Promise.all(tokens.map(one));
    return { sent: results.filter((r) => r === "sent").length, gone: tokens.filter((_, i) => results[i] === "gone"), problems: [...new Set(problems)] };
  } finally { client.close(); }
}
