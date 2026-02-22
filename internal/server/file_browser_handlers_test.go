package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

type fileBrowseTestResponse struct {
	Root    string                `json:"root"`
	Current string                `json:"current"`
	Parent  string                `json:"parent"`
	Entries []fileBrowseTestEntry `json:"entries"`
}

type fileBrowseTestEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"is_directory"`
	Size        int64  `json:"size"`
}

func TestHandleFileBrowseListsEntriesForAbsolutePath(t *testing.T) {
	t.Parallel()

	targetDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(targetDir, "subdir"), 0o755); err != nil {
		t.Fatalf("failed creating subdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(targetDir, "alpha.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("failed creating file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(targetDir, ".hidden.txt"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("failed creating hidden file: %v", err)
	}

	params := url.Values{
		"path": []string{targetDir},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var response fileBrowseTestResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("failed decoding response: %v", err)
	}

	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed reading cwd: %v", err)
	}

	expectedRoot := filepath.Clean(workingDirectory)
	if response.Root != expectedRoot {
		t.Fatalf("expected root %q, got %q", expectedRoot, response.Root)
	}

	expectedCurrent := filepath.Clean(targetDir)
	if response.Current != expectedCurrent {
		t.Fatalf("expected current %q, got %q", expectedCurrent, response.Current)
	}

	if len(response.Entries) != 2 {
		t.Fatalf("expected 2 visible entries, got %d", len(response.Entries))
	}
	if !response.Entries[0].IsDirectory || response.Entries[0].Name != "subdir" {
		t.Fatalf("expected first entry to be directory 'subdir', got %+v", response.Entries[0])
	}
	if response.Entries[1].Name != "alpha.txt" {
		t.Fatalf("expected second entry to be alpha.txt, got %+v", response.Entries[1])
	}
}

func TestHandleFileBrowseIncludesHiddenWhenRequested(t *testing.T) {
	t.Parallel()

	targetDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(targetDir, ".hidden.txt"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("failed creating hidden file: %v", err)
	}

	params := url.Values{
		"path":       []string{targetDir},
		"showHidden": []string{"true"},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var response fileBrowseTestResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("failed decoding response: %v", err)
	}

	if len(response.Entries) != 1 || response.Entries[0].Name != ".hidden.txt" {
		t.Fatalf("expected hidden file in response, got %+v", response.Entries)
	}
}

func TestHandleFileBrowseRejectsRelativePath(t *testing.T) {
	t.Parallel()

	params := url.Values{
		"path": []string{"relative/path"},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}

func TestHandleFileBrowseDefaultsToServerWorkingDirectory(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/files/browse", nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var response fileBrowseTestResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("failed decoding response: %v", err)
	}

	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed reading cwd: %v", err)
	}
	expectedRoot := filepath.Clean(workingDirectory)
	if response.Root != expectedRoot {
		t.Fatalf("expected root %q, got %q", expectedRoot, response.Root)
	}
	if response.Current != expectedRoot {
		t.Fatalf("expected current %q, got %q", expectedRoot, response.Current)
	}
}

func TestHandleFileBrowseRejectsFilePath(t *testing.T) {
	t.Parallel()

	targetDir := t.TempDir()
	targetFile := filepath.Join(targetDir, "not-a-directory.txt")
	if err := os.WriteFile(targetFile, []byte("content"), 0o644); err != nil {
		t.Fatalf("failed creating test file: %v", err)
	}

	params := url.Values{
		"path": []string{targetFile},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
}
