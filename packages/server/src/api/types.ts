import type { Response, Request } from "express";
import type { PrintDatabase } from "../lib/database/database";
import type { AgentHub } from "../realtime/agent-hub";
import type { UploadConfig } from "../server-config";


export interface UploadApiOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
}

export interface UploadedFile {
  buffer: Buffer;
  fileName: string;
  index: number;
}

export interface JobSubmission {
  documents: (UploadedFile & { copies: number; })[];
  title: string | undefined;
}

export interface JobSource {
  submittedBy: (response: Response) => string | null;
  read: (request: Request, config: UploadConfig) => Promise<JobSubmission>;
}
