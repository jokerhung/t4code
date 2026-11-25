import { afterEach, expect, it, vi } from "vite-plus/test";
import { openDirectDownload } from "./directDownload";

vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../localApi", () => ({ readLocalApi: () => undefined }));
afterEach(() => vi.unstubAllGlobals());

it("reserves a tab before the URL is ready and lets the browser download over HTTP", async () => {
  const tab = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  const open = vi.fn(() => tab);
  const fetch = vi.fn();
  vi.stubGlobal("window", { open });
  vi.stubGlobal("fetch", fetch);
  let ready!: (url: string) => void;
  const url = new Promise<string>((resolve) => {
    ready = resolve;
  });
  const download = openDirectDownload(() => url);
  expect(open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(tab.opener).toBeNull();
  expect(tab.location.replace).not.toHaveBeenCalled();
  ready("https://host.example/api/assets/file?token=test");
  await download;
  expect(tab.location.replace).toHaveBeenCalledWith(
    "https://host.example/api/assets/file?token=test",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("closes the reserved tab when preparing the link fails", async () => {
  const tab = { opener: null, closed: false, close: vi.fn() };
  vi.stubGlobal("window", { open: () => tab });
  await expect(
    openDirectDownload(async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(tab.close).toHaveBeenCalledOnce();
});
