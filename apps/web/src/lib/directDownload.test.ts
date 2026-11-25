import { afterEach, expect, it, vi } from "vite-plus/test";
import { openDirectDownload } from "./directDownload";

vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../localApi", () => ({ readLocalApi: () => undefined }));
afterEach(() => vi.unstubAllGlobals());

it("downloads over HTTP without opening a tab or fetching file bytes", async () => {
  const anchor = { href: "", download: undefined, target: "", click: vi.fn(), remove: vi.fn() };
  const createElement = vi.fn(() => anchor);
  const open = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal("document", { createElement, body: { append: vi.fn() } });
  vi.stubGlobal("window", { open });
  vi.stubGlobal("fetch", fetch);
  let ready!: (url: string) => void;
  const url = new Promise<string>((resolve) => {
    ready = resolve;
  });
  const download = openDirectDownload(() => url);
  expect(createElement).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  ready("https://host.example/api/assets/file?token=test");
  await download;
  expect(anchor.href).toBe("https://host.example/api/assets/file?token=test");
  expect(anchor.download).toBe("");
  expect(anchor.target).toBe("");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(anchor.remove).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not navigate when preparing the link fails", async () => {
  const createElement = vi.fn();
  vi.stubGlobal("document", { createElement });
  await expect(
    openDirectDownload(async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(createElement).not.toHaveBeenCalled();
});
