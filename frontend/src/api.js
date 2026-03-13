const API_BASE = "http://localhost:8000";

export async function logEvent(event) {
  const res = await fetch(`${API_BASE}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error("Failed to log event");
  return res.json();
}

export async function getLayout(userId, condition) {
  const url = new URL(`${API_BASE}/layout`);
  url.searchParams.set("user_id", userId);
  url.searchParams.set("condition", condition);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch layout");
  return res.json();
}

export function getExportCsvUrl(userId) {
  const url = new URL(`${API_BASE}/export_csv`);
  if (userId) url.searchParams.set("user_id", userId);
  return url.toString();
}

export function getExportSummaryCsvUrl(userId) {
  const url = new URL(`${API_BASE}/export_summary_csv`);
  if (userId) url.searchParams.set("user_id", userId);
  return url.toString();
}