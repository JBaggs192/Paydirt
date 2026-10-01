// Live rooms: the host broadcasts the game and anyone with the Hoser code
// watches. Online, messages go through Azure Web PubSub (/api/negotiate hands
// out a connection URL). On localhost there's no API, so tabs in the same
// browser talk over a BroadcastChannel instead; that's enough to try it out.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const CODE_LENGTH = 6;

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  return Array.from(bytes, n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}

export const normalizeCode = text => text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
export const isValidCode = code => new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`).test(code);

const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// onMessage(data, fromHost) receives other members' messages; onStatus gets
// "connecting" | "live" | "offline" | "error" (with a message).
export function joinRoom(code, role, handlers) {
  return isLocal ? localRoom(code, role, handlers) : pubsubRoom(code, role, handlers);
}

function localRoom(code, role, { onMessage, onStatus }) {
  const from = `${role}-${Math.random().toString(36).slice(2)}`;
  const channel = new BroadcastChannel(`paydirt-room-${code}`);
  channel.onmessage = e => onMessage(e.data.data, e.data.from.startsWith("host-"));
  queueMicrotask(() => onStatus("live"));
  return {
    send: data => channel.postMessage({ from, data }),
    close: () => channel.close(),
  };
}

function pubsubRoom(code, role, { onMessage, onStatus }) {
  const group = `room-${code}`;
  let socket = null;
  let live = false;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;
  const outbox = []; // sent while disconnected; delivered once we're back

  const retry = () => {
    if (closed) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++));
  };

  async function connect() {
    onStatus("connecting");
    let url;
    try {
      const res = await fetch(`/api/negotiate?room=${code}&role=${role}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Room server error (${res.status})`);
      url = body.url;
    } catch (err) {
      onStatus("error", err.message);
      return retry();
    }
    if (closed) return;

    socket = new WebSocket(url, "json.webpubsub.azure.v1");
    socket.onopen = () => socket.send(JSON.stringify({ type: "joinGroup", group, ackId: 1 }));
    socket.onmessage = e => {
      const msg = JSON.parse(e.data);
      // The token already puts us in the group; joinGroup is a backstop.
      if (msg.type === "system" && msg.event === "connected") {
        live = true;
        attempt = 0;
        outbox.splice(0).forEach(transmit);
        onStatus("live");
      } else if (msg.type === "ack" && !msg.success) {
        onStatus("error", "Couldn't join the room");
      } else if (msg.type === "message" && msg.from === "group") {
        onMessage(msg.data, String(msg.fromUserId || "").startsWith("host-"));
      }
    };
    socket.onclose = () => {
      live = false;
      socket = null;
      if (closed) return;
      onStatus("offline");
      retry();
    };
  }

  const transmit = data =>
    socket.send(JSON.stringify({ type: "sendToGroup", group, dataType: "json", data, noEcho: true }));

  queueMicrotask(connect);
  return {
    send(data) {
      if (live) transmit(data);
      else if (outbox.push(data) > 50) outbox.shift();
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
