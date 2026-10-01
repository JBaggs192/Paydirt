// Builds Azure Web PubSub client URLs without the SDK: a short HS256 JWT
// signed with the service's access key.
const crypto = require("crypto");

function parseConnectionString(conn) {
  const parts = Object.fromEntries(conn.split(";").filter(Boolean).map(part => {
    const i = part.indexOf("=");
    return [part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()];
  }));
  if (!parts.endpoint || !parts.accesskey) throw new Error("Connection string needs Endpoint and AccessKey");
  return { endpoint: parts.endpoint.replace(/\/+$/, ""), key: parts.accesskey };
}

const base64url = value => Buffer.from(value).toString("base64url");

function sign(payload, key) {
  const head = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", key).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

// A connection that may join, and send to, exactly one group.
function clientUrl({ endpoint, key }, hub, { userId, group, ttlSeconds = 12 * 3600 }) {
  const audience = `${endpoint}/client/hubs/${hub}`;
  const now = Math.floor(Date.now() / 1000);
  const token = sign({
    aud: audience,
    iat: now,
    exp: now + ttlSeconds,
    sub: userId,
    role: [`webpubsub.joinLeaveGroup.${group}`, `webpubsub.sendToGroup.${group}`],
    "webpubsub.group": [group],
  }, key);
  return `${audience.replace(/^http/, "ws")}?access_token=${token}`;
}

module.exports = { parseConnectionString, clientUrl, sign };
