export type AppRole = "ADMIN" | "TESTER";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map(normalize)
    .filter(Boolean);
}

export function getRoleForEmail(email?: string | null): AppRole {
  if (!email) return "TESTER";
  const normalized = normalize(email);
  return getAdminEmails().includes(normalized) ? "ADMIN" : "TESTER";
}

