-- AlterEnum (phase 13: a fourth role, ADMIN — a peer of MANAGER). Additive: the
-- new label is only ADDED here, never USED in this migration, so ADD VALUE is
-- transaction-safe on Postgres 12+. Existing rows keep their role untouched.
ALTER TYPE "Role" ADD VALUE 'ADMIN';
