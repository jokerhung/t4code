import { isElectron } from "../env";
import { readLocalApi } from "../localApi";

export async function openDirectDownload(prepareUrl: () => Promise<string | null>) {
  const url = await prepareUrl();
  if (!url) throw new Error("Download URL unavailable");
  if (isElectron) {
    await readLocalApi()?.shell.openExternal(url);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}
