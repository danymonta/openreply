/**
 * Minimal CSV parser for the campaign importer.
 *
 * Handles quoted fields, commas and newlines inside quotes, and escaped
 * quotes (""). Returns one object per data row, keyed by the lowercased,
 * trimmed header names. Blank lines are skipped.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip a fully empty line.
    if (cells.length === 1 && cells[0].trim() === "") continue;

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    out.push(record);
  }

  return out;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush the last field and row if the file did not end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Pull the shortcode out of an Instagram post or reel URL so a pasted link
 * can be matched against a media item's permalink. Returns null if the value
 * does not look like an Instagram post URL.
 */
export function instagramShortcode(value: string): string | null {
  const match = value.match(/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Serializes rows to CSV (RFC 4180 quoting, CRLF). Cells that a spreadsheet
 * would run as a formula (=, +, -, @) get a leading apostrophe, since names
 * and comment text come from strangers on Instagram.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cell === null || cell === undefined ? "" : String(cell);
          if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\r\n");
}
