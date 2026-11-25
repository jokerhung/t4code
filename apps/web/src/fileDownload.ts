import type { EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { msg, useMessages } from "gt-react";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { openDirectDownload } from "./lib/directDownload";
import type { FileContextMenuTarget } from "./fileContextMenu";
import { resolveFileContextMenuAbsolutePath } from "./fileContextMenu";
import { writeTextToClipboard } from "./hooks/useCopyToClipboard";
import { assetEnvironment } from "./state/assets";
import { useFilesystemReadAccess } from "./state/filesystem";
import { usePreparedConnection } from "./state/session";
import { useAtomQueryRunner } from "./state/use-atom-query-runner";
import { toastManager } from "./components/ui/toast";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";

export function useFileDownload(environmentId: EnvironmentId | null) {
  const resolve = useMessages();
  const { canReadFiles } = useFilesystemReadAccess(environmentId, resolve);
  const connection = usePreparedConnection(environmentId);
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    refresh: true,
    reportFailure: false,
  });
  const run = async (target: FileContextMenuTarget, copy: boolean) => {
    if (
      !canReadFiles ||
      !environmentId ||
      connection._tag !== "Some" ||
      target.isDirectory ||
      !target.workspaceRoot
    )
      return;
    const workspaceRoot = target.workspaceRoot;
    const absolutePath = resolveFileContextMenuAbsolutePath(target);
    if (!absolutePath) return;
    try {
      const prepareUrl = async () => {
        const result = await createUrl({
          environmentId,
          input: {
            resource: {
              _tag: "draft-workspace-file",
              cwd: workspaceRoot,
              path: absolutePath,
              disposition: "attachment",
            },
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        const url = resolveAssetUrl(connection.value.httpBaseUrl, result.value.relativeUrl);
        if (!url) throw new Error(resolve(msg("Reconnect to the environment and try again.")));
        return url;
      };
      if (copy) {
        await writeTextToClipboard(await prepareUrl());
        toastManager.add({
          type: "success",
          title: resolve(msg("Download link copied")),
          description: resolve(msg("This temporary link lets you download the file directly.")),
        });
      } else await openDirectDownload(prepareUrl);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: resolve(msg("Unable to download file")),
        description: thrownErrorMessage(error, resolve) ?? resolve(msg("Try again.")),
      });
    }
  };
  return {
    canDownload: canReadFiles && connection._tag === "Some",
    download: (target: FileContextMenuTarget) => run(target, false),
    copyLink: (target: FileContextMenuTarget) => run(target, true),
  };
}
