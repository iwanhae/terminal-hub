package server

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	defaultMaxLoginFailures = 10
	defaultLoginBanDuration = time.Hour
)

type loginFail2Ban struct {
	mu          sync.Mutex
	failures    map[string]int
	bannedUntil map[string]time.Time
	maxFailures int
	banDuration time.Duration
}

func newLoginFail2Ban(maxFailures int, banDuration time.Duration) *loginFail2Ban {
	if maxFailures <= 0 {
		maxFailures = defaultMaxLoginFailures
	}
	if banDuration <= 0 {
		banDuration = defaultLoginBanDuration
	}

	return &loginFail2Ban{
		failures:    make(map[string]int),
		bannedUntil: make(map[string]time.Time),
		maxFailures: maxFailures,
		banDuration: banDuration,
	}
}

func (b *loginFail2Ban) IsBanned(ip string, now time.Time) (bool, time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()

	until, ok := b.bannedUntil[ip]
	if !ok {
		return false, 0
	}

	if !now.Before(until) {
		delete(b.bannedUntil, ip)
		delete(b.failures, ip)
		return false, 0
	}

	return true, until.Sub(now)
}

func (b *loginFail2Ban) RecordFailure(ip string, now time.Time) (bool, time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()

	until, ok := b.bannedUntil[ip]
	if ok {
		if now.Before(until) {
			return true, until.Sub(now)
		}
		delete(b.bannedUntil, ip)
	}

	failures := b.failures[ip] + 1
	if failures >= b.maxFailures {
		until := now.Add(b.banDuration)
		b.bannedUntil[ip] = until
		delete(b.failures, ip)
		return true, until.Sub(now)
	}

	b.failures[ip] = failures
	return false, 0
}

func (b *loginFail2Ban) Reset(ip string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.failures, ip)
	delete(b.bannedUntil, ip)
}

func (b *loginFail2Ban) CleanupExpired(now time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for ip, until := range b.bannedUntil {
		if !now.Before(until) {
			delete(b.bannedUntil, ip)
			delete(b.failures, ip)
		}
	}
}

func (b *loginFail2Ban) StartCleanupLoop(interval time.Duration) {
	if interval <= 0 {
		interval = 5 * time.Minute
	}

	ticker := time.NewTicker(interval)
	for range ticker.C {
		b.CleanupExpired(time.Now())
	}
}

func extractClientIP(r *http.Request) string {
	if forwardedFor := r.Header.Get("X-Forwarded-For"); forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		for _, part := range parts {
			if ip := parseIPCandidate(part); ip != "" {
				return ip
			}
		}
	}

	if ip := parseIPCandidate(r.RemoteAddr); ip != "" {
		return ip
	}

	return strings.TrimSpace(r.RemoteAddr)
}

func parseIPCandidate(candidate string) string {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return ""
	}

	// Try direct parsing first for plain IPv4/IPv6 values.
	if ip := net.ParseIP(candidate); ip != nil {
		return ip.String()
	}

	host, _, err := net.SplitHostPort(candidate)
	if err != nil {
		return ""
	}

	if ip := net.ParseIP(strings.TrimSpace(host)); ip != nil {
		return ip.String()
	}

	return ""
}

func loginBanMessage(remaining time.Duration) string {
	if remaining < time.Minute {
		return "Too many failed login attempts. Try again in less than a minute."
	}

	minutes := int((remaining + time.Minute - 1) / time.Minute)
	if minutes == 1 {
		return "Too many failed login attempts. Try again in 1 minute."
	}

	return fmt.Sprintf("Too many failed login attempts. Try again in %d minutes.", minutes)
}

func logIPBanTriggered(ip string, remaining time.Duration) {
	log.Printf("Login IP ban triggered: ip=%s, duration=%s", ip, remaining.Round(time.Second))
}

func logBannedLoginAttempt(ip string, remaining time.Duration) {
	log.Printf("Blocked login attempt from banned IP: ip=%s, remaining=%s", ip, remaining.Round(time.Second))
}
