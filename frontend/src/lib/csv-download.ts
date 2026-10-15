export function csvDownload(
  headers: string[],
  rows: (string | number | null)[][],
  filename: string,
) {
  const cell = (v: string | number | null) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\uFEFF" +
          [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
