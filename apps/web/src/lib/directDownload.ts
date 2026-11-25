import { isElectron } from "../env";
import { readLocalApi } from "../localApi";

/** Reserve the tab during the click, before preparing a signed HTTP URL. */
export async function openDirectDownload(prepareUrl: () => Promise<string | null>) {
  const tab = isElectron ? null : window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await prepareUrl();
    if (!url) throw new Error("Download URL unavailable");
    if (isElectron) await readLocalApi()?.shell.openExternal(url);
    else if (tab) {
      if (!tab.closed) tab.location.replace(url);
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
