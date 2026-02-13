import { useCallback, useState, type ChangeEvent } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "../../shared/http/client";

type UploadResponse = {
  size?: number;
};

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
      if (selectedFile === null) {
        const message = "Select a file before uploading.";
        setTransferStatus(message);
        toast.error(message);
        return;
      }

      const trimmedUploadPath = uploadPath.trim();
      const trimmedUploadFilename = uploadFilename.trim();
      if (trimmedUploadPath === "" || trimmedUploadFilename === "") {
        const message = "Upload path and filename are required.";
        setTransferStatus(message);
        toast.error(message);
        return;
      }

      setUploading(true);
      setTransferStatus("Uploading...");

      let overwrite = false;
      try {
        for (;;) {
          const params = new URLSearchParams({
            path: trimmedUploadPath,
            filename: trimmedUploadFilename,
          });
          if (overwrite) {
            params.set("overwrite", "true");
          }

          const response = await apiFetch(`/upload?${params.toString()}`, {
            method: "POST",
            headers: {
              "Content-Type": selectedFile.type || "application/octet-stream",
            },
            body: selectedFile,
          });

          if (response.status === 409 && !overwrite) {
            const shouldOverwrite = window.confirm(
              `File "${trimmedUploadFilename}" already exists. Overwrite it?`,
            );
            if (!shouldOverwrite) {
              const message = "Upload canceled.";
              setTransferStatus(message);
              return;
            }
            overwrite = true;
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text();
            const message = `Upload failed: ${errorText}`;
            setTransferStatus(message);
            toast.error(message);
            return;
          }

          const result = (await response.json()) as UploadResponse;
          const sizeLabel =
            typeof result.size === "number"
              ? `${result.size} bytes`
              : "success";

          const message = `Upload complete: ${trimmedUploadFilename} (${sizeLabel}).`;
          setTransferStatus(message);
          toast.success(`Uploaded ${trimmedUploadFilename}`);
          return;
        }
      } catch (error_) {
        console.error("Upload failed:", error_);
        const message = "Upload failed: network or server error.";
        setTransferStatus(message);
        toast.error(message);
      } finally {
        setUploading(false);
      }
    };

    runUpload().catch((error: Error) => {
      console.error("Upload failed:", error);
      const message = "Upload failed: network or server error.";
      setTransferStatus(message);
      setUploading(false);
      toast.error(message);
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
