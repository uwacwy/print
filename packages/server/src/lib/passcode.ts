// Used only by the legacy Fastify server in server/src; the Angular server uses signed upload tokens.
import mysql from 'mysql2/promise';

export interface PasscodeConfig {
  query: string;
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
}

export async function isValidPasscode(
  config: PasscodeConfig | undefined,
  passcode: string | undefined,
): Promise<boolean> {
  if (!config) return false;
  if (!passcode?.trim()) return false;
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 5000,
  });
  try {
    const [rows] = await connection.execute(config.query, [passcode.trim().toLowerCase()]);
    return Array.isArray(rows) && rows.length === 1;
  } finally {
    await connection.end();
  }
}
