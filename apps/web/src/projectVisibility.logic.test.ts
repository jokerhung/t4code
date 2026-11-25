import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  EVERY_PROJECT,
  filterListed,
  projectListFilter,
  resolveSidebarProjectVisibility,
  sameVisibilityByEnvironment,
  type VisibilityByEnvironment,
} from "./projectVisibility.logic";

const laptop = EnvironmentId.make("laptop");
const server = EnvironmentId.make("server");
const alpha = ProjectId.make("alpha");
const beta = ProjectId.make("beta");
const projects = [
  { environmentId: laptop, id: alpha },
  { environmentId: laptop, id: beta },
  { environmentId: server, id: alpha },
];
const visible = (visibility: VisibilityByEnvironment) => {
  const isListed = projectListFilter(visibility);
  return filterListed(projects, visibility, (project) =>
    isListed(project.environmentId, project.id),
  ).map((project) => `${project.environmentId}:${project.id}`);
};

describe("projectListFilter", () => {
  it("returns the same list when nothing is limited", () => {
    expect(filterListed(projects, new Map(), () => false)).toBe(projects);
  });

  it("limits only the environment that has a list, ignoring ids with no project", () => {
    expect(
      visible(
        new Map([[laptop, { mode: "selected", projectIds: [beta, ProjectId.make("deleted")] }]]),
      ),
    ).toEqual(["laptop:beta", "server:alpha"]);
  });

  it("hides an environment's projects for an empty list or while waiting for one", () => {
    expect(visible(new Map([[laptop, { mode: "selected", projectIds: [] }]]))).toEqual([
      "server:alpha",
    ]);
    expect(visible(new Map([[server, "pending"]]))).toEqual(["laptop:alpha", "laptop:beta"]);
  });
});

describe("resolveSidebarProjectVisibility", () => {
  const selected = { mode: "selected", projectIds: [alpha] } as const;
  const input = {
    live: null,
    remembered: null,
    supported: true,
    connected: true,
    failed: false,
  } as const;

  it("prefers the live answer, then the remembered one", () => {
    expect(
      resolveSidebarProjectVisibility({ ...input, live: EVERY_PROJECT, remembered: selected }),
    ).toBe(EVERY_PROJECT);
    expect(
      resolveSidebarProjectVisibility({ ...input, remembered: selected, connected: false }),
    ).toBe(selected);
  });

  it("waits only while a connected server can still answer", () => {
    expect(resolveSidebarProjectVisibility(input)).toBe("pending");
    expect(resolveSidebarProjectVisibility({ ...input, supported: undefined })).toBe("pending");
    expect(resolveSidebarProjectVisibility({ ...input, connected: false })).toEqual(EVERY_PROJECT);
    expect(resolveSidebarProjectVisibility({ ...input, failed: true })).toEqual(EVERY_PROJECT);
  });

  it("shows everything for a server without the feature, even with an old remembered list", () => {
    expect(
      resolveSidebarProjectVisibility({ ...input, supported: false, remembered: selected }),
    ).toEqual(EVERY_PROJECT);
  });
});

describe("sameVisibilityByEnvironment", () => {
  const of = (...projectIds: Array<ProjectId>): VisibilityByEnvironment =>
    new Map([[laptop, { mode: "selected", projectIds }]]);

  it("compares lists by value", () => {
    expect(sameVisibilityByEnvironment(of(alpha), of(alpha))).toBe(true);
    expect(sameVisibilityByEnvironment(of(alpha), of(beta))).toBe(false);
    expect(sameVisibilityByEnvironment(of(alpha), new Map([[laptop, "pending"]]))).toBe(false);
    expect(sameVisibilityByEnvironment(of(alpha), new Map())).toBe(false);
  });
});
