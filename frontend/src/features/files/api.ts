import { dispatchSessionInvalidEvent } from "../auth/sessionEvents";
import { apiFetch, throwApiError } from "../../shared/http/client";

const uploadPathHeader = "X-Terminal-Hub-Upload-Path";
const uploadFilenameHeader = "X-Terminal-Hub-Upload-Filename";
const uploadOverwriteHeader = "X-Terminal-Hub-Upload-Overwrite";

export interface FilesWorkspaceEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified_at: string;
}

export interface BrowseWorkspaceFilesResponse {
  root: string;
  current: string;
  parent?: string;
  entries: FilesWorkspaceEntry[];
}

export interface UploadWorkspaceFileOptions {
  file: File;
  destinationPath: string;
  filename?: string;
  overwrite?: boolean;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface UploadWorkspaceFileResponse {
  path: string;
  filename: string;
  size: number;
  overwritten: boolean;
}

export type UploadWorkspaceRequestError = Error & {
  status: number;
  responseText: string;
};

function createUploadRequestError(
  status: number,
  responseText: string,
): UploadWorkspaceRequestError {
  const detail =
    responseText.trim() === "" ? `HTTP ${String(status)}` : responseText.trim();
  const error = new Error(
    `Upload failed: ${detail}`,
  ) as UploadWorkspaceRequestError;
  error.status = status;
  error.responseText = responseText;
  return error;
}

function parseUploadResponse(text: string): UploadWorkspaceFileResponse {
  const parsed = JSON.parse(text) as Partial<UploadWorkspaceFileResponse>;
  return {
    path: typeof parsed.path === "string" ? parsed.path : "",
    filename: typeof parsed.filename === "string" ? parsed.filename : "",
    size: typeof parsed.size === "number" ? parsed.size : 0,
    overwritten: parsed.overwritten === true,
  };
}

function basename(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const last = parts.at(-1);
  if (last == null || last.trim() === "") {
    return "downloaded-file";
  }
  return last;
}

function contentDispositionFilename(
  contentDisposition: string | null,
): string | null {
  if (contentDisposition == null || contentDisposition.trim() === "") {
    return null;
  }

  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
  if (match == null || match[1] == null) {
    return null;
  }

  let candidate = match[1].trim().replaceAll('"', "");
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Keep original value if decoding fails
  }
  return candidate === "" ? null : candidate;
}

export function isUploadWorkspaceRequestError(
  error_: unknown,
): error_ is UploadWorkspaceRequestError {
  return (
    error_ instanceof Error &&
    "status" in error_ &&
    typeof (error_ as { status: unknown }).status === "number" &&
    "responseText" in error_ &&
    typeof (error_ as { responseText: unknown }).responseText === "string"
  );
}

export async function browseWorkspaceFiles(
  path?: string,
  showHidden = false,
): Promise<BrowseWorkspaceFilesResponse> {
  const query = new URLSearchParams();
  if (path != null && path.trim() !== "") {
    query.set("path", path.trim());
  }
  if (showHidden) {
    query.set("showHidden", "true");
  }

  const queryString = query.toString();
  const requestPath =
    queryString === "" ? "/files/browse" : `/files/browse?${queryString}`;
  const response = await apiFetch(requestPath);
  if (!response.ok) {
    await throwApiError(response, "Failed to browse files");
  }
  return response.json() as Promise<BrowseWorkspaceFilesResponse>;
}

export function uploadWorkspaceFile(
  options: UploadWorkspaceFileOptions,
): Promise<UploadWorkspaceFileResponse> {
  const {
    file,
    destinationPath,
    filename,
    overwrite = false,
    onProgress,
    signal,
  } = options;

  const resolvedFilename = (filename ?? file.name).trim();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finishWithSuccess = (value: UploadWorkspaceFileResponse) => {
      if (settled) return;
      settled = true;
      if (signal != null) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve(value);
    };

    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      if (signal != null) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(error);
    };

    const onAbort = () => {
      xhr.abort();
      finishWithError(new Error("Upload canceled"));
    };

    if (signal != null && signal.aborted) {
      finishWithError(new Error("Upload canceled"));
      return;
    }

    if (signal != null) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader(uploadPathHeader, destinationPath);
    xhr.setRequestHeader(uploadFilenameHeader, resolvedFilename);
    xhr.setRequestHeader(uploadOverwriteHeader, overwrite ? "true" : "false");

    xhr.upload.onprogress = (event) => {
      if (onProgress == null) {
        return;
      }

      const total =
        event.lengthComputable && event.total > 0 ? event.total : file.size;
      const loaded = Math.min(event.loaded, total);
      onProgress(loaded, total);
    };

    xhr.onerror = () => {
      finishWithError(new Error("Upload failed: network error"));
    };

    xhr.onabort = () => {
      finishWithError(new Error("Upload canceled"));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        dispatchSessionInvalidEvent("http-401");
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          finishWithSuccess(parseUploadResponse(xhr.responseText));
        } catch (error_) {
          finishWithError(
            error_ instanceof Error
              ? error_
              : new Error("Upload failed: invalid server response"),
          );
        }
        return;
      }

      finishWithError(createUploadRequestError(xhr.status, xhr.responseText));
    };

    xhr.send(file);
  });
}

export async function downloadWorkspaceFile(
  path: string,
  filename?: string,
): Promise<void> {
  const trimmedPath = path.trim();
  if (trimmedPath === "") {
    throw new Error("File path is required");
  }

  const params = new URLSearchParams({ path: trimmedPath });
  const trimmedFilename = filename?.trim() ?? "";
  if (trimmedFilename !== "") {
    params.set("filename", trimmedFilename);
  }

  const response = await apiFetch(`/download?${params.toString()}`, {
    method: "GET",
  });
  if (!response.ok) {
    await throwApiError(response, "Failed to download file");
  }

  const blob = await response.blob();
  const objectURL = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectURL;

  const headerFilename = contentDispositionFilename(
    response.headers.get("Content-Disposition"),
  );
  if (trimmedFilename !== "") {
    anchor.download = trimmedFilename;
  } else if (headerFilename != null && headerFilename !== "") {
    anchor.download = headerFilename;
  } else {
    anchor.download = basename(trimmedPath);
  }

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectURL);
}
