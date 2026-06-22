/**
 * File System Access API helpers.
 *
 * Chromium-based browsers (Chrome, Edge, Arc, Brave) support showDirectoryPicker
 * which lets the user pick an arbitrary folder. Safari + Firefox don't yet, so
 * we feature-detect and fall back to a hint to type the path manually.
 *
 * Since the render API runs server-side (Node) and takes a POSIX/absolute
 * path, we can't directly use the picked directory handle — but we CAN
 * extract the directory name and prompt the user to confirm the absolute
 * path. (In a real cloud product, we'd never let users pick local paths;
 * everything would go to cloud storage.)
 */

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<any>;
    showSaveFilePicker?: (opts: any) => Promise<any>;
  }
}

export const folderPickerSupported = (): boolean =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

/**
 * Pick a folder. Returns the folder's display name (e.g. "MyProject") OR
 * null if cancelled / unsupported. The caller is responsible for prompting
 * the user for the full absolute path, since browsers don't expose it.
 */
export async function pickFolderName(): Promise<string | null> {
  if (!folderPickerSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ mode: "read" });
    return handle.name ?? null;
  } catch {
    return null; // user cancelled
  }
}

/**
 * Save a file using the native Save As dialog (lets user pick destination
 * folder + filename). Returns true if saved, false if cancelled/unsupported.
 *
 * Fallback when not supported: the caller should fall back to the standard
 * <a download> approach which writes to Downloads/.
 */
export async function nativeSaveJson(
  filename: string,
  json: string,
): Promise<boolean> {
  if (!window.showSaveFilePicker) return false;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Scene JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return true;
  } catch {
    return false; // cancelled
  }
}
