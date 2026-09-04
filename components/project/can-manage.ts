"use client";

import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isExecutiveRole } from "@/lib/roles";
import type { ProjectDTO } from "@/lib/types";

/**
 * May this person RUN the project? The client mirror of
 * lib/project-people canManageProject: FOUNDER/DIRECTOR anywhere, the HOD of
 * its department, the owner, or a member marked canManage. A hidden button and
 * a refused request must agree, so the rule lives in one shape on both sides.
 */
export function useCanManage(project: ProjectDTO | null): boolean {
  const { data: me } = useMe();
  const { data: departments } = useDepartments();
  const { data: people } = useProjectPeople(project?.id ?? null);
  if (!me || !project) return false;
  if (isExecutiveRole(me.role)) return true;
  if (project.ownerId === me.id) return true;
  if (me.role === "HOD") {
    const dept = (departments ?? []).find((d) => d.id === project.departmentId);
    if (dept?.hodId === me.id) return true;
  }
  const list = people ?? project.people;
  return list.some((p) => p.id === me.id && p.canManage);
}
