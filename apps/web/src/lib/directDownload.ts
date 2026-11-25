/** The signed response supplies the attachment filename and streams bytes over HTTP. */
export async function openDirectDownload(prepareUrl: () => Promise<string | null>) {
  const url = await prepareUrl();
  if (!url) throw new Error("Download URL unavailable");
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
