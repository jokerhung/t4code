import type {
  AuthProjectVisibility,
  AuthUpdateProjectVisibilityInput,
  EnvironmentId,
  ProjectId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { T, useGT } from "gt-react";
import { useId, useState } from "react";

import { EVERY_PROJECT } from "../../projectVisibility.logic";
import { authEnvironment } from "~/state/auth";
import { useProjects, useServerConfigs } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button, InlineButton } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Radio, RadioGroup } from "../ui/radio-group";
import { toastManager } from "../ui/toast";

type PickableProject = { readonly id: ProjectId; readonly title: string; readonly path: string };

/** False for older servers, which would silently create a link that shows every project. */
export function useSupportsProjectVisibility(environmentId: EnvironmentId | null): boolean {
  const configs = useServerConfigs();
  return (
    environmentId !== null &&
    configs.get(environmentId)?.environment?.capabilities.projectVisibility === true
  );
}

function usePickableProjects(environmentId: EnvironmentId): ReadonlyArray<PickableProject> {
  return useProjects()
    .filter((project) => project.environmentId === environmentId)
    .map((project) => ({ id: project.id, title: project.title, path: project.workspaceRoot }))
    .toSorted((left, right) => left.title.localeCompare(right.title));
}

export function hasEmptyProjectSelection(value: AuthProjectVisibility): boolean {
  return value.mode === "selected" && value.projectIds.length === 0;
}

export function ProjectVisibilityPicker({
  environmentId,
  value,
  onChange,
  disabled = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly value: AuthProjectVisibility;
  readonly onChange: (value: AuthProjectVisibility) => void;
  readonly disabled?: boolean;
}) {
  const gt = useGT();
  const headingId = useId();
  const projects = usePickableProjects(environmentId);
  const [query, setQuery] = useState("");
  const selected = new Set(value.mode === "selected" ? value.projectIds : []);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? projects.filter((project) =>
        `${project.title}\n${project.path}`.toLowerCase().includes(needle),
      )
    : projects;
  const select = (projectIds: ReadonlyArray<ProjectId>) =>
    onChange({ mode: "selected", projectIds: [...projectIds] });

  return (
    <section className="space-y-2" aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className="text-xs font-medium text-foreground">
          <T>Projects shown on this device</T>
        </h3>
        <p className="text-xs text-muted-foreground">
          <T>This only hides projects from the sidebar. It does not block access to them.</T>
        </p>
      </div>
      <RadioGroup
        aria-labelledby={headingId}
        value={value.mode}
        disabled={disabled}
        onValueChange={(mode) => {
          if (mode === "all") onChange(EVERY_PROJECT);
          else if (value.mode !== "selected") select([]);
        }}
      >
        <label className="flex items-center gap-2 text-xs text-foreground">
          <Radio value="all" />
          <T>All projects, including new ones</T>
        </label>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <Radio value="selected" />
          <T>Only selected projects</T>
        </label>
      </RadioGroup>
      {value.mode === "selected" ? (
        <div className="space-y-2">
          <Input
            type="search"
            aria-label={gt("Search projects")}
            placeholder={gt("Search projects...")}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{gt("{count} selected", { count: selected.size })}</span>
            <span className="flex gap-3">
              <InlineButton
                disabled={disabled}
                onClick={() => select(projects.map((project) => project.id))}
              >
                <T>Select all</T>
              </InlineButton>
              <InlineButton disabled={disabled} onClick={() => select([])}>
                <T>Clear</T>
              </InlineButton>
            </span>
          </div>
          <div className="max-h-48 divide-y divide-border/60 overflow-y-auto rounded-lg border border-input bg-muted/25">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                <T>No matching projects.</T>
              </p>
            ) : (
              matches.map((project) => (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(project.id)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      select(
                        checked === true
                          ? [...selected, project.id]
                          : [...selected].filter((id) => id !== project.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {project.title}
                    </span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {project.path}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** A row's summary of the projects a link or device shows, which opens the editor. */
export function ProjectVisibilityControl({
  environmentId,
  target,
  value = EVERY_PROJECT,
  canEdit,
}: {
  readonly environmentId: EnvironmentId;
  readonly target: AuthUpdateProjectVisibilityInput["target"];
  readonly value: AuthProjectVisibility | undefined;
  readonly canEdit: boolean;
}) {
  const gt = useGT();
  const projects = usePickableProjects(environmentId);
  const update = useAtomCommand(authEnvironment.updateProjectVisibility, { reportFailure: false });
  const [draft, setDraft] = useState<AuthProjectVisibility | null>(null);
  const [saving, setSaving] = useState(false);
  const existing = new Set(projects.map((project) => project.id));
  const summary =
    value.mode === "all"
      ? gt("All projects")
      : gt("{count, plural, one {{count} project} other {{count} projects}}", {
          count: value.projectIds.filter((id) => existing.has(id)).length,
        });

  const save = async (projectVisibility: AuthProjectVisibility) => {
    setSaving(true);
    const result = await update({ environmentId, input: { target, projectVisibility } });
    setSaving(false);
    if (result._tag === "Success") {
      setDraft(null);
      if (!result.value.updated) {
        toastManager.add({
          type: "warning",
          title:
            "pairingLinkId" in target
              ? gt("This link was already used. Edit the device it paired.")
              : gt("This device is no longer paired."),
        });
      }
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not update the shown projects"),
        ...(error instanceof Error ? { description: error.message } : {}),
      });
    }
  };

  return (
    <>
      {canEdit ? (
        <InlineButton
          aria-label={gt("Edit shown projects: {summary}", { summary })}
          onClick={() => setDraft(value)}
        >
          {summary}
        </InlineButton>
      ) : (
        <span>{summary}</span>
      )}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <T>Shown projects</T>
            </DialogTitle>
            <DialogDescription>
              <T>Choose what this device lists. It updates without pairing again.</T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {draft !== null ? (
              <ProjectVisibilityPicker
                environmentId={environmentId}
                value={draft}
                onChange={setDraft}
                disabled={saving}
              />
            ) : null}
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button variant="outline" disabled={saving} onClick={() => setDraft(null)}>
              <T>Cancel</T>
            </Button>
            <Button
              disabled={saving || !canEdit || draft === null}
              onClick={() => {
                if (draft !== null) void save(draft);
              }}
            >
              {saving ? gt("Saving…") : gt("Save")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
