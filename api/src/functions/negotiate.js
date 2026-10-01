// GET /api/negotiate?room=ABC123&role=host|viewer
// Returns a WebSocket URL for that room's group in Azure Web PubSub.
const crypto = require("crypto");
const { app } = require("@azure/functions");
const { parseConnectionString, clientUrl } = require("../token");

const HUB = "paydirt";
const ROOM_CODE = /^[A-Z0-9]{6}$/;

app.http("negotiate", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async request => {
    const conn = process.env.WEBPUBSUB_CONNECTION_STRING;
    if (!conn) return { status: 503, jsonBody: { error: "The room server isn't set up yet." } };

    const room = (request.query.get("room") || "").toUpperCase();
    if (!ROOM_CODE.test(room)) return { status: 400, jsonBody: { error: "That Hoser code doesn't look right." } };
    const role = request.query.get("role") === "host" ? "host" : "viewer";

    const url = clientUrl(parseConnectionString(conn), HUB, {
      userId: `${role}-${crypto.randomUUID()}`,
      group: `room-${room}`,
    });
    return { headers: { "Cache-Control": "no-store" }, jsonBody: { url } };
  },
});
