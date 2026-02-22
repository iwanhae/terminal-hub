import { useCallback, useState, type ChangeEvent } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../shared/http/client";

type UploadResponse = {
  size?: number;
};

type UploadPayload =
  | {
      file: File;
      uploadPath: string;
      uploadFilename: string;
    }
  | {
      error: string;
    };

type UploadResult =
  | {
      type: "success";
      size?: number;
    }
  | {
      type: "canceled";
    }
  | {
      type: "error";
      message: string;
    };

function setErrorTransferStatus(
  setTransferStatus: (value: string) => void,
  message: string,
) {
  setTransferStatus(message);
  toast.error(message);
}

function buildUploadPayload(
  selectedFile: File | null,
  uploadPath: string,
  uploadFilename: string,
): UploadPayload {
  if (selectedFile === null) {
    return { error: "Select a file before uploading." };
  }

  const trimmedUploadPath = uploadPath.trim();
  const trimmedUploadFilename = uploadFilename.trim();
  if (trimmedUploadPath === "" || trimmedUploadFilename === "") {
    return { error: "Upload path and filename are required." };
  }

  return {
    file: selectedFile,
    uploadPath: trimmedUploadPath,
    uploadFilename: trimmedUploadFilename,
  };
}

async function sendUploadRequest(
  file: File,
  uploadPath: string,
  uploadFilename: string,
  overwrite: boolean,
): Promise<Response> {
  return apiFetch("/upload", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Terminal-Hub-Upload-Path": uploadPath,
      "X-Terminal-Hub-Upload-Filename": uploadFilename,
      "X-Terminal-Hub-Upload-Overwrite": overwrite ? "true" : "false",
    },
    body: file,
  });
}

async function runUploadRequest(
  file: File,
  uploadPath: string,
  uploadFilename: string,
): Promise<UploadResult> {
  let overwrite = false;

  for (;;) {
    const response = await sendUploadRequest(
      file,
      uploadPath,
      uploadFilename,
      overwrite,
    );
    if (response.status === 409 && !overwrite) {
      const shouldOverwrite = window.confirm(
        `File "${uploadFilename}" already exists. Overwrite it?`,
      );
      if (!shouldOverwrite) {
        return { type: "canceled" };
      }
      overwrite = true;
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { type: "error", message: `Upload failed: ${errorText}` };
    }

    const result = (await response.json()) as UploadResponse;
    return { type: "success", size: result.size };
  }
}

export interface UseFileTransferResult {
  selectedFile: File | null;
  uploadPath: string;
  uploadFilename: string;
  downloadPath: string;
  downloadFilename: string;
  uploading: boolean;
  downloading: boolean;
  transferStatus: string;
  setUploadPath: (value: string) => void;
  setUploadFilename: (value: string) => void;
  setDownloadPath: (value: string) => void;
  setDownloadFilename: (value: string) => void;
  setTransferStatus: (value: string) => void;
  handleFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  uploadSelectedFile: () => void;
  downloadFile: () => void;
}

export function useFileTransfer(
  initialUploadPath = "/tmp",
): UseFileTransferResult {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPath, setUploadPath] = useState(initialUploadPath);
  const [uploadFilename, setUploadFilename] = useState("");
  const [downloadPath, setDownloadPath] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      setSelectedFile(file);
      if (file != null) {
        setUploadFilename(file.name);
      }
    },
    [],
  );

  const uploadSelectedFile = useCallback(() => {
    const runUpload = async () => {
      const payload = buildUploadPayload(
        selectedFile,
        uploadPath,
        uploadFilename,
      );
      if ("error" in payload) {
        setErrorTransferStatus(setTransferStatus, payload.error);
        return;
      }

      setUploading(true);
      setTransferStatus("Uploading...");

      try {
        const result = await runUploadRequest(
          payload.file,
          payload.uploadPath,
          payload.uploadFilename,
        );
        if (result.type === "canceled") {
          setTransferStatus("Upload canceled.");
          return;
        }

        if (result.type === "error") {
          setErrorTransferStatus(setTransferStatus, result.message);
          return;
        }

        const sizeLabel =
          typeof result.size === "number" ? `${result.size} bytes` : "success";
        const message = `Upload complete: ${payload.uploadFilename} (${sizeLabel}).`;
        setTransferStatus(message);
        toast.success(`Uploaded ${payload.uploadFilename}`);
      } catch (error_) {
        console.error("Upload failed:", error_);
        setErrorTransferStatus(
          setTransferStatus,
          "Upload failed: network or server error.",
        );
      } finally {
        setUploading(false);
      }
    };

    runUpload().catch((error: Error) => {
      console.error("Upload failed:", error);
      setErrorTransferStatus(
        setTransferStatus,
        "Upload failed: network or server error.",
      );
      setUploading(false);
    });
  }, [selectedFile, uploadFilename, uploadPath]);

  const downloadFile = useCallback(() => {
    const runDownload = async () => {
      const trimmedDownloadPath = downloadPath.trim();
      if (trimmedDownloadPath === "") {
        const message = "Download path is required.";
        setTransferStatus(message);
        toast.error(message);
        return;
      }

      setDownloading(true);
      setTransferStatus("Preparing download...");

      try {
        const params = new URLSearchParams({ path: trimmedDownloadPath });
        const trimmedDownloadFilename = downloadFilename.trim();
        if (trimmedDownloadFilename !== "") {
          params.set("filename", trimmedDownloadFilename);
        }

        const response = await apiFetch(`/download?${params.toString()}`, {
          method: "GET",
        });
        if (!response.ok) {
          const errorText = await response.text();
          const message = `Download failed: ${errorText}`;
          setTransferStatus(message);
          toast.error(message);
          return;
        }

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        if (trimmedDownloadFilename !== "") {
          anchor.download = trimmedDownloadFilename;
        }
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);

        const statusName =
          trimmedDownloadFilename === ""
            ? "requested file"
            : trimmedDownloadFilename;
        const message = `Download started: ${statusName}.`;
        setTransferStatus(message);
        toast.success(`Download started: ${statusName}`);
      } catch (error_) {
        console.error("Download failed:", error_);
        const message = "Download failed: network or server error.";
        setTransferStatus(message);
        toast.error(message);
      } finally {
        setDownloading(false);
      }
    };

    runDownload().catch((error: Error) => {
      console.error("Download failed:", error);
      const message = "Download failed: network or server error.";
      setTransferStatus(message);
      setDownloading(false);
      toast.error(message);
    });
  }, [downloadFilename, downloadPath]);

  return {
    selectedFile,
    uploadPath,
    uploadFilename,
    downloadPath,
    downloadFilename,
    uploading,
    downloading,
    transferStatus,
    setUploadPath,
    setUploadFilename,
    setDownloadPath,
    setDownloadFilename,
    setTransferStatus,
    handleFileSelect,
    uploadSelectedFile,
    downloadFile,
  };
}
