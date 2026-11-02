// @ts-check
import http from "node:http";
import { SOCKET_PATH } from "@uwacwy/print-shared";

/**
 * `ng serve` only. The dev server loads server.ts lazily, on the first request it renders, so the
 * socket.io side port (SOCKET_DEV_PORT) isn't listening until then; an agent that connects first
 * would otherwise get ECONNREFUSED until someone opens a page. Before proxying any SOCKET_PATH
 * request (polling or upgrade), make one request to the dev server itself: that loads server.ts,
 * whose top-level await only settles once the socket listener is up.
 */
const socketPort = Number(process.env["SOCKET_DEV_PORT"] || 4201);

/** @type {Promise<void> | undefined} */
let serverLoaded;

/**
 * Requests `/api/healthz` from the dev server that received `request`, forcing server.ts to load.
 * @param {http.IncomingMessage} request
 * @returns {Promise<void>}
 */
const loadServer = (request) =>
  new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: request.socket.localAddress,
          port: request.socket.localPort,
          path: "/api/healthz",
          headers: { host: request.headers.host ?? "localhost" },
        },
        (response) => {
          response.resume();
          if (response.statusCode === 200) {
            resolve();
          } else {
            reject(
              new Error(
                `server.ts warm-up returned ${response.statusCode}`,
              ),
            );
          }
        },
      )
      .on("error", reject);
  });

/** @param {http.IncomingMessage} request */
const ensureServerLoaded = (request) =>
  (serverLoaded ??= loadServer(request).catch((error) => {
    // Retry on the next request, e.g. after fixing a server.ts error.
    serverLoaded = undefined;
    throw error;
  }));

export default {
  // A regex key (leading `^`) so `/ws` matches only the socket endpoint, not e.g. `/wsfoo`.
  [`^${SOCKET_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|\\?|$)`]:
    {
      target: `http://127.0.0.1:${socketPort}`,
      ws: true,
      changeOrigin: false,
      logLevel: "warn",
      /** @param {http.IncomingMessage} request */
      bypass: (request) =>
        ensureServerLoaded(request)
          // Proxy anyway; the client's own reconnect retries once server.ts loads.
          .catch(() => {})
          .then(() => undefined),
      /** @param {{ on(event: 'error', listener: () => void): unknown }} proxy */
      configure: (proxy) => {
        // The listener went away (e.g. SOCKET_DEV_PORT changed); warm up again next time.
        proxy.on("error", () => {
          serverLoaded = undefined;
        });
      },
    },
};
