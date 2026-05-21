export const normalizeCode = (value) => {
  const clean = String(value || "").trim().toUpperCase();
  const compactMatch = clean.match(/^BIN(\d{3})$/);
  if (compactMatch) return `BIN-${compactMatch[1]}`;
  return clean;
};

export const getScanTarget = (scanValue, bins, origin = "http://localhost") => {
  const text = String(scanValue || "").trim();

  try {
    const url = new URL(text, origin);
    const bin = url.searchParams.get("bin");
    const station = url.searchParams.get("station");
    if (bin) return { type: "bin", code: normalizeCode(bin) };
    if (station) return { type: "station", code: normalizeCode(station) };
  } catch {
    // Plain QR codes are supported too.
  }

  const normalized = normalizeCode(text);
  const exactBin = bins.find((bin) => bin.id === normalized || bin.qrCode === normalized);
  if (exactBin) return { type: "bin", code: normalized };

  const stationCode = normalized.split("-")[0];
  const stationBin = bins.find((bin) => bin.qrCode?.startsWith(`${stationCode}-`));
  if (stationBin) return { type: "station", code: stationCode };

  return { type: "bin", code: normalized };
};
