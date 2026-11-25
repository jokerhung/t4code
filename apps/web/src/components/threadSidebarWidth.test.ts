import { describe, expect, it } from "vite-plus/test";

import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
} from "./threadSidebarWidth";

function renderedWidth(sidebarWidth: number, viewportWidth: number): number {
  const minimumWidth = resolveThreadSidebarMinimumWidth(0);
  return clampThreadSidebarWidth(
    sidebarWidth,
    minimumWidth,
    resolveThreadSidebarMaximumWidth(viewportWidth, minimumWidth),
  );
}

describe("thread sidebar width", () => {
  it("keeps a manually resized width when the viewport widens", () => {
    const sidebarWidth = 350;
    expect(renderedWidth(sidebarWidth, 840)).toBe(208);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(350);
  });

  it("starts at the minimum and stays there when the viewport widens", () => {
    const sidebarWidth = resolveInitialThreadSidebarWidth();
    expect(renderedWidth(sidebarWidth, 840)).toBe(208);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(208);
  });
});
