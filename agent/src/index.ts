import { setTimeout as delay } from "node:timers/promises";
import {
  AGENT_WS_PATH,
  agentJobFilePath,
  agentJobStatusPath,
  HEARTBEAT_INTERVAL_MS,
  parseServerMessage,
  type AgentJob,
  type JobReport,
} from "@uwacwy/print-shared";
import WebSocket from "ws";
import { createPrinter, type IPrinter } from "./printer/printer.js";

const serverUrlText = process.env.PRINT_SERVER_URL;
const token = process.env.PRINT_AGENT_TOKEN;
const printerUriText = process.env.PRINTER_URI;
const maximumPdfBytes = Number(process.env.MAX_JOB_MB ?? 100) * 1024 * 1024;
if (!serverUrlText || !token || !printerUriText)
  throw new Error(
    "PRINT_SERVER_URL, PRINT_AGENT_TOKEN, and PRINTER_URI are required.",
  );
if (!Number.isFinite(maximumPdfBytes) || maximumPdfBytes < 1024 * 1024)
  throw new Error("MAX_JOB_MB must be a positive size in MB.");
const serverUrl = new URL(serverUrlText);
if (serverUrl.protocol !== "https:" && serverUrl.protocol !== "http:")
  throw new Error("PRINT_SERVER_URL must use HTTP or HTTPS.");
const apiOrigin = serverUrl.origin;
const wsUrl = new URL(AGENT_WS_PATH, serverUrl);
wsUrl.protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
const activeJobs = new Set<string>();
let stopping = false;
let retryDelay = 1000;
let currentSocket: WebSocket | undefined;
let jobChain = Promise.resolve();
let printer: IPrinter;

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

async function report(jobId: string, result: JobReport): Promise<void> {
  let retry = 1000;
  while (!stopping) {
    try {
      const response = await fetch(
        new URL(agentJobStatusPath(jobId), apiOrigin),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(result),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok || response.status === 404) return;
      if (response.status < 500)
        throw new Error(`Status report rejected (${response.status}).`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Status report rejected")
      )
        throw error;
    }
    await delay(retry);
    retry = Math.min(retry * 2, 30_000);
  }
  throw new Error("Agent is shutting down before status acknowledgement.");
}

async function processJob(job: AgentJob, socket: WebSocket): Promise<void> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      job.id,
    )
  )
    return;
  if (activeJobs.has(job.id)) return;
  activeJobs.add(job.id);
  try {
    let printError: unknown;
    try {
      const response = await fetch(
        new URL(agentJobFilePath(job.id), apiOrigin),
        {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!response.ok)
        throw new Error(`Job download failed (${response.status}).`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > maximumPdfBytes)
        throw new Error("Downloaded job exceeds MAX_JOB_MB.");
      const pdf = Buffer.from(await response.arrayBuffer());
      if (
        pdf.length > maximumPdfBytes ||
        pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
      )
        throw new Error("Downloaded job is not a valid PDF.");
      await printer.print(pdf, job);
    } catch (error) {
      printError = error;
    }
    if (printError) {
      const message =
        printError instanceof Error
          ? printError.message.slice(0, 500)
          : "Unknown print error";
      log(`Job ${job.id} failed: ${message}`);
      await report(job.id, { status: "failed", error: message });
    } else {
      await report(job.id, { status: "printed" });
      log(`Submitted job ${job.id} to printer.`);
    }
  } catch (error) {
    log(
      `Could not process or acknowledge job ${job.id}: ${error instanceof Error ? error.message : error}`,
    );
    socket.terminate();
  } finally {
    activeJobs.delete(job.id);
  }
}

async function run(): Promise<void> {
  printer = await createPrinter(printerUriText!, maximumPdfBytes);
  log(`Using ${printer.constructor.name}.`);
  while (!stopping) {
    const socket = new WebSocket(wsUrl, {
      headers: { authorization: `Bearer ${token}` },
      perMessageDeflate: false,
    });
    currentSocket = socket;
    let syncTimer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve) => {
      socket.once("open", () => {
        retryDelay = 1000;
        log("Connected to print server.");
        socket.send(JSON.stringify({ type: "sync" }));
        syncTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "sync" }));
        }, HEARTBEAT_INTERVAL_MS);
      });
      socket.on("message", (raw) => {
        const message = parseServerMessage(raw.toString());
        if (message?.type === "hello")
          log(`Registered for ${message.printer.name}.`);
        if (message?.type === "jobs") {
          jobChain = jobChain.then(async () => {
            for (const job of message.jobs) await processJob(job, socket);
          });
        }
      });
      socket.on("error", (error) => log(`Connection error: ${error.message}`));
      socket.once("close", () => {
        if (syncTimer) clearInterval(syncTimer);
        if (currentSocket === socket) currentSocket = undefined;
        log("Disconnected; reconnecting.");
        resolve();
      });
    });
    if (!stopping) {
      const jitter = Math.floor((Math.random() * retryDelay) / 3);
      await delay(retryDelay + jitter);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }
  }
}

function shutdown(): void {
  stopping = true;
  // A stalled close handshake must not keep the agent printing after it was told to stop.
  setTimeout(() => process.exit(0), 5000).unref();
  if (!currentSocket) return;
  if (currentSocket.readyState === WebSocket.OPEN)
    currentSocket.close(1000, "Agent shutting down");
  else currentSocket.terminate();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
