package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/iwanhae/terminal-hub/terminal"
)

type browseTestPTYService struct{}

func (s *browseTestPTYService) Start(_ string) (*os.File, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	if closeErr := writer.Close(); closeErr != nil {
		return nil, closeErr
	}
	return reader, nil
}

func (s *browseTestPTYService) StartWithConfig(
	_ string,
	_ string,
	_ map[string]string,
) (*os.File, *exec.Cmd, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, nil, err
	}
	if closeErr := writer.Close(); closeErr != nil {
		return nil, nil, closeErr
	}
	return reader, nil, nil
}

func (s *browseTestPTYService) SetSize(_ *os.File, _, _ int) error {
	return nil
}

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

func setupBrowseTestSessionManager(t *testing.T) {
	t.Helper()

	originalManager := sessionManager
	testManager := terminal.NewSessionManager()
	sessionManager = testManager

	t.Cleanup(func() {
		_ = testManager.CloseAll()
		sessionManager = originalManager
	})
}

func createBrowseTestSession(t *testing.T, workingDirectory string) string {
	t.Helper()

	sessionID := fmt.Sprintf(
		"%s-%d",
		strings.ReplaceAll(t.Name(), "/", "-"),
		time.Now().UnixNano(),
	)

	_, err := sessionManager.CreateSession(terminal.SessionConfig{
		ID:               sessionID,
		Name:             "Browse Test",
		WorkingDirectory: workingDirectory,
		HistorySize:      256,
		PTYService:       &browseTestPTYService{},
	})
	if err != nil {
		t.Fatalf("failed creating test session: %v", err)
	}

	return sessionID
}

func TestHandleFileBrowseListsEntriesWithinSessionRoot(t *testing.T) {
	setupBrowseTestSessionManager(t)

	rootDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(rootDir, "subdir"), 0o755); err != nil {
		t.Fatalf("failed creating subdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(rootDir, "alpha.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("failed creating file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(rootDir, ".hidden.txt"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("failed creating hidden file: %v", err)
	}

	sessionID := createBrowseTestSession(t, rootDir)

	params := url.Values{"sessionId": []string{sessionID}}
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

	expectedRoot := filepath.Clean(rootDir)
	if response.Root != expectedRoot {
		t.Fatalf("expected root %q, got %q", expectedRoot, response.Root)
	}
	if response.Current != expectedRoot {
		t.Fatalf("expected current %q, got %q", expectedRoot, response.Current)
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
	setupBrowseTestSessionManager(t)

	rootDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(rootDir, ".hidden.txt"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("failed creating hidden file: %v", err)
	}

	sessionID := createBrowseTestSession(t, rootDir)

	params := url.Values{
		"sessionId":  []string{sessionID},
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

func TestHandleFileBrowseRejectsPathOutsideRoot(t *testing.T) {
	setupBrowseTestSessionManager(t)

	rootDir := t.TempDir()
	sessionID := createBrowseTestSession(t, rootDir)

	params := url.Values{
		"sessionId": []string{sessionID},
		"path":      []string{filepath.Dir(rootDir)},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d: %s", http.StatusForbidden, rec.Code, rec.Body.String())
	}
}

func TestHandleFileBrowseRejectsRelativePath(t *testing.T) {
	setupBrowseTestSessionManager(t)

	rootDir := t.TempDir()
	sessionID := createBrowseTestSession(t, rootDir)

	params := url.Values{
		"sessionId": []string{sessionID},
		"path":      []string{"relative/path"},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d: %s", http.StatusForbidden, rec.Code, rec.Body.String())
	}
}

func TestHandleFileBrowseReturnsNotFoundForUnknownSession(t *testing.T) {
	setupBrowseTestSessionManager(t)

	params := url.Values{"sessionId": []string{"missing"}}
	req := httptest.NewRequest(http.MethodGet, "/api/files/browse?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	handleFileBrowse(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d: %s", http.StatusNotFound, rec.Code, rec.Body.String())
	}
}

func TestHandleFileBrowseFallsBackToServerWorkingDirectory(t *testing.T) {
	setupBrowseTestSessionManager(t)

	sessionID := createBrowseTestSession(t, "")
	params := url.Values{"sessionId": []string{sessionID}}
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
}
