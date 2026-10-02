// Thin localStorage adapter. All persistence goes through here, so swapping to
// a server DB later is a one-file change. Write-through on every mutation.

const KEY = "nluja.attendance.v1";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, records: {} };
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || typeof data.records !== "object") {
      return { version: 1, records: {} };
    }
    return data;
  } catch {
    return { version: 1, records: {} };
  }
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function setMark(data, section, dk, periodId, status, day) {
  data.records[section] = data.records[section] || {};
  data.records[section][dk] = data.records[section][dk] || {};
  data.records[section][dk][periodId] = { status, at: new Date().toISOString(), ...(day ? { day } : {}) };
  save(data);
  return data;
}

export function clearMark(data, section, dk, periodId) {
  const day = data.records?.[section]?.[dk];
  if (day && day[periodId]) {
    delete day[periodId];
    if (!Object.keys(day).length) delete data.records[section][dk];
    save(data);
  }
  return data;
}

export function exportBlob(data) {
  return new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
}

export async function importFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || typeof data.records !== "object") {
    throw new Error("Not a valid attendance backup file");
  }
  save(data);
  return data;
}

export function snapshot(data) {
  save(data);
  return data;
}
