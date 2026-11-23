export function buildSafeCsv(rows: string[][], delimiter = ";") {
  const escapeCell = (input: string) => {
    let value = String(input);
    if (/^[\t\r ]*[=+@-]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(delimiter)).join("\r\n")}`;
}
