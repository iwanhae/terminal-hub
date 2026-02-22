package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

type fileUploadTestResponse struct {
	Path        string `json:"path"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	Overwritten bool   `json:"overwritten"`
}

func newUploadRequest(
	t *testing.T,
	uploadPath string,
	filename string,
	overwrite bool,
	body []byte,
) *http.Request {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader(body))
	req.Header.Set(uploadPathHeader, uploadPath)
	req.Header.Set(uploadFilenameHeader, filename)
	if overwrite {
		req.Header.Set(uploadOverwriteHeader, "true")
	}

	return req
}

func TestHandleFileUploadStreamsBodyToFile(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	payload := bytes.Repeat([]byte("stream-data-"), 200_000)

	req := newUploadRequest(t, tempDir, "streamed.bin", false, payload)
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var response fileUploadTestResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("failed decoding response: %v", err)
	}

	if response.Overwritten {
		t.Fatalf("expected overwritten=false for new file upload")
	}

	savedPath := filepath.Join(tempDir, "streamed.bin")
	savedData, err := os.ReadFile(savedPath)
	if err != nil {
		t.Fatalf("failed reading uploaded file: %v", err)
	}

	if !bytes.Equal(savedData, payload) {
		t.Fatalf("uploaded content mismatch: expected %d bytes, got %d", len(payload), len(savedData))
	}
}

func TestHandleFileUploadConflictAndOverwrite(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "target.txt")
	if err := os.WriteFile(targetPath, []byte("old-data"), 0o644); err != nil {
		t.Fatalf("failed creating seed file: %v", err)
	}

	conflictReq := newUploadRequest(t, tempDir, "target.txt", false, []byte("new-data"))
	conflictRec := httptest.NewRecorder()
	handleFileUpload(conflictRec, conflictReq)

	if conflictRec.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, conflictRec.Code, conflictRec.Body.String())
	}

	overwriteReq := newUploadRequest(t, tempDir, "target.txt", true, []byte("new-data"))
	overwriteRec := httptest.NewRecorder()
	handleFileUpload(overwriteRec, overwriteReq)

	if overwriteRec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, overwriteRec.Code, overwriteRec.Body.String())
	}

	var response fileUploadTestResponse
	if err := json.NewDecoder(overwriteRec.Body).Decode(&response); err != nil {
		t.Fatalf("failed decoding response: %v", err)
	}
	if !response.Overwritten {
		t.Fatalf("expected overwritten=true when existing file is replaced")
	}

	updatedData, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed reading overwritten file: %v", err)
	}
	if string(updatedData) != "new-data" {
		t.Fatalf("expected overwritten content %q, got %q", "new-data", string(updatedData))
	}
}

func TestHandleFileUploadRejectsRelativePath(t *testing.T) {
	t.Parallel()

	req := newUploadRequest(t, "relative/path", "file.txt", false, []byte("data"))
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}

func TestHandleFileUploadRequiresFilenameHeader(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader([]byte("data")))
	req.Header.Set(uploadPathHeader, t.TempDir())
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}

func TestHandleFileUploadRequiresPathHeader(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader([]byte("data")))
	req.Header.Set(uploadFilenameHeader, "file.txt")
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}
