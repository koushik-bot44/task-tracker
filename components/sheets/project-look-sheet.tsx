"use client";

import { Check, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PROJECT_ICONS, ProjectMark } from "@/components/ui/project-mark";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { uploadFile, useUploadsEnabled } from "@/lib/hooks/use-comments";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { PROJECT_COLORS, PROJECT_ICON_NAMES } from "@/lib/project-look";
import type { ProjectDTO } from "@/lib/types";

/**
 * "Project look": a colour, an icon (or the first letter), or an uploaded
 * logo. The preview at the top is exactly what the card and the header will
 * show. One Save.
 */
export function ProjectLookSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectDTO }) {
  const { updateProject } = useProjectMutations();
  const { data: uploads } = useUploadsEnabled();
  const { show: toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [color, setColor] = useState(project.color);
  const [icon, setIcon] = useState<string | null>(project.icon);
  const [logoUrl, setLogoUrl] = useState<string | null>(project.logoUrl);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setColor(project.color);
    setIcon(project.icon);
    setLogoUrl(project.logoUrl);
  }, [open, project.color, project.icon, project.logoUrl]);

  const pickLogo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ message: "A logo has to be a picture.", tone: "danger" });
      return;
    }
    setUploading(true);
    try {
      const up = await uploadFile(file);
      setLogoUrl(up.url);
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    if (updateProject.isPending) return;
    updateProject.mutate(
      { id: project.id, patch: { color, icon, logoUrl } },
      {
        onSuccess: () => {
          onClose();
          toast({ message: "Look saved" });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Project look"
      subtitle={project.name}
      footer={
        <Button variant="primary" full onClick={save} loading={updateProject.isPending} disabled={uploading}>
          Save
        </Button>
      }
    >
      <div className="space-y-6 pt-1">
        <div className="flex items-center gap-3">
          <ProjectMark name={project.name} color={color} icon={icon} logoUrl={logoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-row font-semibold text-ink">{project.name}</p>
            <p className="text-sm text-muted">{logoUrl ? "Your logo" : icon ? "Icon on a colour" : "First letter on a colour"}</p>
          </div>
        </div>

        {uploads?.enabled ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Upload a logo"
              onChange={(e) => void pickLogo(e.target.files?.[0] ?? null)}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading} icon={<ImagePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />}>
              {logoUrl ? "Change logo" : "Upload a logo"}
            </Button>
            {logoUrl ? (
              <Button variant="quiet" onClick={() => setLogoUrl(null)} icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />}>
                Remove logo
              </Button>
            ) : null}
            <span className="w-full text-micro text-muted">A square picture looks best. Without a logo, the icon and colour below are used.</span>
          </div>
        ) : null}

        <div>
          <span className="mb-2 block text-micro font-medium text-muted">Colour</span>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => {
              const active = c.hex.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setColor(c.hex)}
                  className={cn("press grid h-10 w-10 place-items-center rounded-full", active && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                  style={{ background: c.hex }}
                >
                  {active ? <Check className="h-5 w-5 text-on-primary" strokeWidth={2.5} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-micro font-medium text-muted">Icon</span>
          <div role="radiogroup" aria-label="Icon" className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            <button
              type="button"
              role="radio"
              aria-checked={icon === null}
              aria-label="First letter"
              onClick={() => setIcon(null)}
              className={cn("press grid h-12 place-items-center rounded-input bg-hover text-row font-semibold text-ink", icon === null && "ring-2 ring-primary")}
            >
              {(project.name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()}
            </button>
            {PROJECT_ICON_NAMES.map((name) => {
              const { Icon, label } = PROJECT_ICONS[name];
              const active = icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  title={label}
                  onClick={() => setIcon(name)}
                  className={cn("press grid h-12 place-items-center rounded-input bg-hover text-ink", active && "ring-2 ring-primary")}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
