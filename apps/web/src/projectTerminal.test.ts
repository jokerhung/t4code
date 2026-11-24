import { scopeProjectRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { projectTerminalRef } from "./projectTerminal";

describe("project terminals", () => {
  it("keeps the same terminal owner across visits and separates projects and environments", () => {
    const environmentId = EnvironmentId.make("local");
    const project = scopeProjectRef(environmentId, ProjectId.make("project-a"));
    const owner = scopedThreadKey(projectTerminalRef(project));
    expect(scopedThreadKey(projectTerminalRef({ ...project }))).toBe(owner);
    expect(
      scopedThreadKey(
        projectTerminalRef(scopeProjectRef(environmentId, ProjectId.make("project-b"))),
      ),
    ).not.toBe(owner);
    expect(
      scopedThreadKey(
        projectTerminalRef(scopeProjectRef(EnvironmentId.make("remote"), project.projectId)),
      ),
    ).not.toBe(owner);
  });
});
