/**
 * The structure a new organisation starts from (owner, 2026-09-11). The very
 * first set-up (app/api/auth/bootstrap) makes these when there are no
 * departments; from then on the CEO renames, adds and removes them from the
 * Departments page. Structure only — nobody is placed in them.
 */
export const DEFAULT_DEPARTMENTS: readonly { name: string; color: string; description: string }[] = [
  { name: "Development", color: "#475569", description: "Building and running the software and products." },
  { name: "Administration", color: "#7c3aed", description: "Company administration — the paperwork, approvals and day-to-day running of the office." },
  { name: "Accounts", color: "#0d9488", description: "Money in and money out — billing, payments, payroll and the books." },
  { name: "Operations", color: "#be123c", description: "Keeping the company's day-to-day work running smoothly." },
  { name: "Research and Development", color: "#a16207", description: "Research and development — building and trying new things." },
  { name: "ERM", color: "#be123c", description: "Enterprise risk management — spotting and handling risks before they become problems." },
  { name: "HR", color: "#7c3aed", description: "People — hiring, onboarding, leave and everything about the team itself." },
  { name: "Network Admins", color: "#0d9488", description: "The systems and network the company runs on — uptime, access and security." },
  { name: "Self", color: "#4d7c0f", description: "Personal growth and internal initiatives." },
];
