package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/iwanhae/terminal-hub/auth"
)

type loginHandlerTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func newTestAuthSessionManager() *auth.SessionManager {
	return auth.NewSessionManager("admin", "secret", 24*time.Hour)
}

func performLoginRequest(
	t *testing.T,
	sm *auth.SessionManager,
	banTracker *loginFail2Ban,
	forwardedFor string,
	remoteAddr string,
	username string,
	password string,
) *httptest.ResponseRecorder {
	t.Helper()

	payload, err := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})
	if err != nil {
		t.Fatalf("failed to marshal login payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}

	rec := httptest.NewRecorder()
	handleLogin(rec, req, sm, banTracker)

	return rec
}

func decodeLoginResponse(t *testing.T, rec *httptest.ResponseRecorder) loginHandlerTestResponse {
	t.Helper()

	var response loginHandlerTestResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode login response JSON: %v (body=%q)", err, rec.Body.String())
	}
	return response
}

func TestHandleLoginBansIPOnTenthFailedAttempt(t *testing.T) {
	t.Parallel()

	sm := newTestAuthSessionManager()
	banTracker := newLoginFail2Ban(10, time.Hour)
	ip := "198.51.100.10"

	for i := 1; i <= 9; i++ {
		rec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "wrong")
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status %d, got %d", i, http.StatusUnauthorized, rec.Code)
		}
	}

	rec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "wrong")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("attempt 10: expected status %d, got %d", http.StatusTooManyRequests, rec.Code)
	}

	response := decodeLoginResponse(t, rec)
	if response.Success {
		t.Fatalf("expected success=false on banned response")
	}

	bannedRec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "secret")
	if bannedRec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected banned IP to stay blocked with status %d, got %d",
			http.StatusTooManyRequests, bannedRec.Code)
	}
}

func TestHandleLoginBanExpiresAndAllowsSuccessfulLogin(t *testing.T) {
	t.Parallel()

	sm := newTestAuthSessionManager()
	banTracker := newLoginFail2Ban(1, time.Hour)
	ip := "198.51.100.20"

	rec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "wrong")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status %d, got %d", http.StatusTooManyRequests, rec.Code)
	}

	banTracker.mu.Lock()
	banTracker.bannedUntil[ip] = time.Now().Add(-time.Second)
	banTracker.mu.Unlock()

	successRec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "secret")
	if successRec.Code != http.StatusOK {
		t.Fatalf("expected status %d after ban expiry, got %d: %s",
			http.StatusOK, successRec.Code, successRec.Body.String())
	}
}

func TestHandleLoginSuccessResetsFailureCounter(t *testing.T) {
	t.Parallel()

	sm := newTestAuthSessionManager()
	banTracker := newLoginFail2Ban(3, time.Hour)
	ip := "198.51.100.30"

	for i := 1; i <= 2; i++ {
		rec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "wrong")
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected status %d, got %d", i, http.StatusUnauthorized, rec.Code)
		}
	}

	successRec := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "secret")
	if successRec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, successRec.Code, successRec.Body.String())
	}

	postSuccessFailure := performLoginRequest(t, sm, banTracker, ip, "10.0.0.1:4000", "admin", "wrong")
	if postSuccessFailure.Code != http.StatusUnauthorized {
		t.Fatalf("expected reset failure count to return status %d, got %d",
			http.StatusUnauthorized, postSuccessFailure.Code)
	}
}

func TestHandleLoginBanIsScopedPerIP(t *testing.T) {
	t.Parallel()

	sm := newTestAuthSessionManager()
	banTracker := newLoginFail2Ban(2, time.Hour)
	bannedIP := "198.51.100.40"
	otherIP := "203.0.113.5"

	first := performLoginRequest(t, sm, banTracker, bannedIP, "10.0.0.1:4000", "admin", "wrong")
	if first.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, first.Code)
	}

	second := performLoginRequest(t, sm, banTracker, bannedIP, "10.0.0.1:4000", "admin", "wrong")
	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status %d, got %d", http.StatusTooManyRequests, second.Code)
	}

	other := performLoginRequest(t, sm, banTracker, otherIP, "10.0.0.2:5000", "admin", "secret")
	if other.Code != http.StatusOK {
		t.Fatalf("expected other IP to succeed with status %d, got %d: %s",
			http.StatusOK, other.Code, other.Body.String())
	}
}

func TestExtractClientIPUsesFirstValidForwardedAddress(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.RemoteAddr = "10.0.0.9:8080"
	req.Header.Set("X-Forwarded-For", "unknown, 198.51.100.50, 203.0.113.10")

	got := extractClientIP(req)
	want := "198.51.100.50"
	if got != want {
		t.Fatalf("expected IP %q, got %q", want, got)
	}
}

func TestExtractClientIPFallsBackToRemoteAddr(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.RemoteAddr = "198.51.100.60:8080"
	req.Header.Set("X-Forwarded-For", "unknown")

	got := extractClientIP(req)
	want := "198.51.100.60"
	if got != want {
		t.Fatalf("expected fallback IP %q, got %q", want, got)
	}
}
