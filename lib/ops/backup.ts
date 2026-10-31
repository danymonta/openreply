import { spawn } from "node:child_process";
import { sendOpsEmail } from "@/lib/ops/mailer";

/**
 * Nightly logical backup: pg_dump in custom format, emailed to the owner.
 *
 * Railway's Hobby plan has no volume backups, and contacts, stats and
 * campaigns exist only in this database. Email keeps the copy outside Railway
 * with no extra storage account. The custom format is already compressed;
 * restore with `pg_restore --no-owner --clean -d <DATABASE_URL> file.dump`.
 */

// Resend caps a message at 40 MB including base64 overhead (~4/3).
const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024;

/** libpq rejects Prisma-only query parameters such as ?schema=public. */
export function pgDumpUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  url.searchParams.delete("connection_limit");
  url.searchParams.delete("pool_timeout");
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

function dump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-privileges", `--dbname=${pgDumpUrl(databaseUrl)}`],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks, size));
      // The URL holds the password: never echo pg_dump's argv, only stderr.
      else reject(new Error(`pg_dump exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

export async function runDatabaseBackup(now = new Date()) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { sent: false, reason: "DATABASE_URL not set" };

  const date = now.toISOString().slice(0, 10);
  let data: Buffer;
  try {
    data = await dump(databaseUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await sendOpsEmail({
      subject: `Backup del ${date} NON riuscito`,
      text: `Il backup notturno del database non è riuscito:\n${reason}\n`,
    });
    return { sent: false, reason };
  }

  const sizeMb = (data.length / 1024 / 1024).toFixed(2);
  if (data.length > MAX_ATTACHMENT_BYTES) {
    await sendOpsEmail({
      subject: `Backup del ${date} troppo grande per la mail`,
      text: `Il backup pesa ${sizeMb} MB, oltre il limite degli allegati. Serve spostarlo su uno storage esterno.\n`,
    });
    return { sent: false, reason: `dump too large (${sizeMb} MB)`, bytes: data.length };
  }

  const result = await sendOpsEmail({
    subject: `Backup del ${date}`,
    text:
      `In allegato il backup completo del database di OpenReply (${sizeMb} MB): campagne, contatti, statistiche.\n\n` +
      `Conserva questa mail. Per ripristinarlo:\n` +
      `pg_restore --no-owner --clean -d "<DATABASE_URL>" openreply-${date}.dump\n`,
    attachments: [{ filename: `openreply-${date}.dump`, content: data }],
  });
  return { ...result, bytes: data.length };
}
