package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleFileUploadStreamsBodyToFile(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	payload := bytes.Repeat([]byte("stream-data-"), 200_000)

	params := url.Values{
		"path":     []string{tempDir},
		"filename": []string{"streamed.bin"},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/upload?"+params.Encode(), bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
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

	params := url.Values{
		"path":     []string{tempDir},
		"filename": []string{"target.txt"},
	}
	conflictReq := httptest.NewRequest(http.MethodPost, "/api/upload?"+params.Encode(), bytes.NewReader([]byte("new-data")))
	conflictRec := httptest.NewRecorder()
	handleFileUpload(conflictRec, conflictReq)

	if conflictRec.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, conflictRec.Code, conflictRec.Body.String())
	}

	params.Set("overwrite", "true")
	overwriteReq := httptest.NewRequest(http.MethodPost, "/api/upload?"+params.Encode(), bytes.NewReader([]byte("new-data")))
	overwriteRec := httptest.NewRecorder()
	handleFileUpload(overwriteRec, overwriteReq)

	if overwriteRec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, overwriteRec.Code, overwriteRec.Body.String())
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

	params := url.Values{
		"path":     []string{"relative/path"},
		"filename": []string{"file.txt"},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/upload?"+params.Encode(), bytes.NewReader([]byte("data")))
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}

func TestHandleFileUploadRequiresFilename(t *testing.T) {
	t.Parallel()

	params := url.Values{
		"path": []string{t.TempDir()},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/upload?"+params.Encode(), bytes.NewReader([]byte("data")))
	rec := httptest.NewRecorder()

	handleFileUpload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}
