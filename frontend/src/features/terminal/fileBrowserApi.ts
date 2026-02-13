import { apiFetch, throwApiError } from "../../shared/http/client";

export interface FileBrowserEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified_at: string;
}

export interface BrowseFilesResponse {
  root: string;
  current: string;
  parent?: string;
  entries: FileBrowserEntry[];
}

export async function browseFiles(
  sessionId: string,
  path?: string,
  showHidden = false,
): Promise<BrowseFilesResponse> {
  const query = new URLSearchParams({ sessionId });
  if (path != null && path.trim() !== "") {
    query.set("path", path.trim());
  }
  if (showHidden) {
    query.set("showHidden", "true");
  }

  const response = await apiFetch(`/files/browse?${query.toString()}`);
  if (!response.ok) {
    await throwApiError(response, "Failed to browse files");
  }
  return response.json() as Promise<BrowseFilesResponse>;
}
