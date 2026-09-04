"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useReducedMotion } from "framer-motion";
import { ChevronRight, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useMemo, useState } from "react";
import { NotesThread } from "@/components/notes/notes-thread";
import { useCanManage } from "@/components/project/can-manage";
import { MilestoneBox, type BoxState } from "@/components/project/milestone-box";
import { NoteBubble } from "@/components/project/note-bubble";
import { ProjectHeader } from "@/components/project/project-header";
import { TaskRowOverlay, boxIdFromDrop } from "@/components/project/task-row";
import { AddMilestoneSheet } from "@/components/sheets/add-milestone-sheet";
import { AddPeopleSheet } from "@/components/sheets/add-people-sheet";
import { GiveTaskSheet } from "@/components/sheets/give-task-sheet";
import { MoveReviewSheet } from "@/components/sheets/move-review-sheet";
import { SetProgressSheet } from "@/components/sheets/set-progress-sheet";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Connector } from "@/components/ui/connector";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { longDate, startOfDay } from "@/lib/dates";
import { useMilestones } from "@/lib/hooks/use-milestones";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectBySlug, useProjectPeople } from "@/lib/hooks/use-projects";
import { useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { isExecutiveRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { MilestoneDTO, TaskDTO } from "@/lib/types";

/** Boxes on the left, the note beside each at ≥768px. */
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-x-4";

/** Drop into the box under the pointer; fall back to the box the row overlaps most. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-content px-4 pb-10 pt-4 md:pt-6">{children}</div>;
}

/**
 * /project/<slug> — the owner's sketch: PROJECT START, then one box per
 * milestone down the page with its note beside it, then "+ Add milestone".
 */
export function ProjectPage({ slug }: { slug: string }) {
  const { project, isLoading, isError, refetch } = useProjectBySlug(slug);
  const projectId = project?.id ?? null;
  const { data: me } = useMe();
  const { data: people } = useProjectPeople(projectId);
  const milestonesQ = useMilestones(projectId);
  const tasksQ = useTasks(projectId);
  const { updateTask } = useTaskMutations({ kind: "project", projectId: projectId ?? "" });
  const { openTask } = usePanelParams();
  const { show: toast } = useToast();
  const canManage = useCanManage(project);
  const canSetProgress = isExecutiveRole(me?.role);
  const reduce = useReducedMotion();

  // Sheets and drawers. Targets outlive `open` so a closing sheet keeps its words.
  const [giveOpen, setGiveOpen] = useState(false);
  const [giveTarget, setGiveTarget] = useState<{ milestoneId: string | null; reviewDate: string | null }>({ milestoneId: null, reviewDate: null });
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MilestoneDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesTarget, setNotesTarget] = useState<MilestoneDTO | null>(null);
  const [projectNotesOpen, setProjectNotesOpen] = useState(false);

  const milestones = useMemo(
    () => [...(milestonesQ.data ?? [])].sort((a, b) => new Date(a.reviewDate).getTime() - new Date(b.reviewDate).getTime() || a.orderKey.localeCompare(b.orderKey)),
    [milestonesQ.data],
  );
  const roots = useMemo(() => (tasksQ.data ?? []).filter((t) => t.parentId === null && !t.archived && !t.deletedAt), [tasksQ.data]);
  const byBox = useMemo(() => {
    const map = new Map<string | null, TaskDTO[]>();
    const known = new Set(milestones.map((m) => m.id));
    for (const t of roots) {
      const key = t.milestoneId && known.has(t.milestoneId) ? t.milestoneId : null;
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
    return map;
  }, [roots, milestones]);

  const today = startOfDay(new Date()).getTime();
  const states = useMemo(() => {
    const out = new Map<string, BoxState>();
    let currentFound = false;
    for (const m of milestones) {
      const past = startOfDay(new Date(m.reviewDate)).getTime() < today || m.outcome !== null;
      if (past) out.set(m.id, "past");
      else if (!currentFound) {
        out.set(m.id, "current");
        currentFound = true;
      } else out.set(m.id, "future");
    }
    return out;
  }, [milestones, today]);

  const loose = byBox.get(null) ?? [];
  const doneCount = roots.filter((t) => t.status === "DONE").length;
  const lastReview = milestones.length > 0 ? milestones[milestones.length - 1].reviewDate : null;

  const toggleDone = useCallback(
    (task: TaskDTO, done: boolean) => {
      updateTask.mutate(
        { id: task.id, patch: { status: done ? "DONE" : "TODO" } },
        { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
      );
    },
    [updateTask, toast],
  );

  const giveTask = (milestoneId: string | null, reviewDate: string | null) => {
    setGiveTarget({ milestoneId, reviewDate });
    setGiveOpen(true);
  };
  const moveReview = (m: MilestoneDTO) => {
    setMoveTarget(m);
    setMoveOpen(true);
  };
  const openNotes = (m: MilestoneDTO) => {
    setNotesTarget(m);
    setNotesOpen(true);
  };

  // ── Drag a row between boxes ──────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const [active, setActive] = useState<TaskDTO | null>(null);
  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { task?: TaskDTO } | undefined)?.task ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const task = active;
    setActive(null);
    if (!task || !e.over) return;
    const target = boxIdFromDrop(e.over.id);
    if (target === task.milestoneId) return;
    const name = target ? milestones.find((m) => m.id === target)?.name ?? "that milestone" : "Not in a milestone yet";
    updateTask.mutate(
      { id: task.id, patch: { milestoneId: target } },
      {
        onSuccess: () => toast({ message: `Moved to ${name}` }),
        onError: (err) => toast({ message: (err as Error).message, tone: "danger" }),
      },
    );
  };
  const activeReview = active ? milestones.find((m) => m.id === active.milestoneId)?.reviewDate ?? null : null;

  // ── States ────────────────────────────────────────────────────────────────
  if (isLoading && !project) {
    return (
      <Shell>
        <Skeleton rows={4} />
      </Shell>
    );
  }
  if (isError && !project) {
    return (
      <Shell>
        <ErrorState onRetry={() => refetch()} />
      </Shell>
    );
  }
  if (!project) {
    return (
      <Shell>
        <EmptyState
          title="No project with that address."
          body="It may have been renamed or removed."
          action={
            <Link href="/projects" className="press inline-flex h-11 items-center rounded-input bg-hover px-4 text-sm font-semibold text-ink">
              All projects
            </Link>
          }
        />
      </Shell>
    );
  }

  const startIso = project.startDate ?? project.createdAt;
  const listLoading = milestonesQ.isLoading || tasksQ.isLoading;
  const listError = milestonesQ.isError || tasksQ.isError;

  return (
    <Shell>
      <ProjectHeader
        project={project}
        people={people ?? project.people}
        canManage={canManage}
        canSetProgress={canSetProgress}
        onAddPeople={() => setPeopleOpen(true)}
        onSetProgress={() => setProgressOpen(true)}
      />

      <div className="mt-6">
        {listLoading ? (
          <Skeleton rows={3} />
        ) : listError ? (
          <ErrorState
            onRetry={() => {
              void milestonesQ.refetch();
              void tasksQ.refetch();
            }}
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
            <div className={COLS}>
              <div className="text-center">
                <p className="smallcaps text-muted">Project start</p>
                <p className="text-sm font-medium text-ink">{longDate(startIso)}</p>
              </div>
            </div>

            {milestones.length === 0 ? (
              <>
                <div className={COLS}>
                  <Connector />
                </div>
                <div className={COLS}>
                  <EmptyState
                    title="No milestones yet."
                    body="A milestone is a box of tasks with a review date."
                    action={
                      canManage ? (
                        <Button variant="secondary" icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />} onClick={() => setAddOpen(true)}>
                          Add milestone
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              </>
            ) : (
              milestones.map((m, i) => {
                const state = states.get(m.id) ?? "future";
                return (
                  <Fragment key={m.id}>
                    <div className={COLS}>
                      <Connector />
                    </div>
                    <div className={cn(COLS, "md:items-start")}>
                      <MilestoneBox
                        milestone={m}
                        index={i + 1}
                        state={state}
                        tasks={byBox.get(m.id) ?? []}
                        canManage={canManage}
                        onGiveTask={() => giveTask(m.id, m.reviewDate)}
                        onMoveReview={() => moveReview(m)}
                        onToggleDone={toggleDone}
                        onOpenTask={openTask}
                      />
                      <NoteBubble note={m.latestNote} label={`${m.name} notes`} onOpen={() => openNotes(m)} className="mt-2 md:mt-0" />
                    </div>
                  </Fragment>
                );
              })
            )}

            {loose.length > 0 ? (
              <div className={cn(COLS, "mt-6")}>
                <MilestoneBox
                  milestone={null}
                  index={0}
                  state="loose"
                  tasks={loose}
                  canManage={canManage}
                  onGiveTask={() => giveTask(null, null)}
                  onMoveReview={() => undefined}
                  onToggleDone={toggleDone}
                  onOpenTask={openTask}
                />
              </div>
            ) : null}

            <DragOverlay dropAnimation={reduce ? null : undefined}>{active ? <TaskRowOverlay task={active} reviewDate={activeReview} /> : null}</DragOverlay>
          </DndContext>
        )}

        {!listLoading && !listError && canManage && milestones.length > 0 ? (
          <>
            <div className={COLS}>
              <Connector />
            </div>
            <div className={COLS}>
              <Button variant="secondary" full icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />} onClick={() => setAddOpen(true)}>
                Add milestone
              </Button>
            </div>
          </>
        ) : null}

        {!listLoading && !listError ? (
          <div className={cn(COLS, "mt-8")}>
            <button
              type="button"
              onClick={() => setProjectNotesOpen(true)}
              className="card press flex min-h-[56px] w-full items-center gap-3 px-4 text-left"
            >
              <MessageSquare className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 text-row text-ink">Project notes</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <GiveTaskSheet open={giveOpen} onClose={() => setGiveOpen(false)} projectId={project.id} milestoneId={giveTarget.milestoneId} reviewDate={giveTarget.reviewDate} />
      <MoveReviewSheet open={moveOpen} onClose={() => setMoveOpen(false)} projectId={project.id} milestone={moveTarget} />
      <AddMilestoneSheet open={addOpen} onClose={() => setAddOpen(false)} projectId={project.id} previousReviewDate={lastReview} startDate={project.startDate} />
      <SetProgressSheet open={progressOpen} onClose={() => setProgressOpen(false)} project={project} done={doneCount} total={roots.length} />
      <AddPeopleSheet open={peopleOpen} onClose={() => setPeopleOpen(false)} projectId={project.id} />

      <Drawer
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        label={`${notesTarget?.name ?? "Milestone"} notes`}
        header={<h2 className="truncate text-section font-semibold text-ink">{notesTarget?.name ?? "Milestone"} notes</h2>}
      >
        <div className="px-4 pt-1">{notesTarget ? <NotesThread targetType="MILESTONE" targetId={notesTarget.id} autoFocus /> : null}</div>
      </Drawer>
      <Drawer
        open={projectNotesOpen}
        onClose={() => setProjectNotesOpen(false)}
        label="Project notes"
        header={<h2 className="truncate text-section font-semibold text-ink">Project notes</h2>}
      >
        <div className="px-4 pt-1">
          <NotesThread targetType="PROJECT" targetId={project.id} autoFocus />
        </div>
      </Drawer>
    </Shell>
  );
}
