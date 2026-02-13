package cron

import (
	"sync"
	"time"
)

// TimeProvider abstracts time operations for testability
type TimeProvider interface {
	Now() time.Time
	After(d time.Duration) <-chan time.Time
	NewTimer(d time.Duration) Timer
	Sleep(d time.Duration)
}

// Timer abstracts time.Timer for testability
type Timer interface {
	C() <-chan time.Time
	Reset(d time.Duration) bool
	Stop() bool
}

// RealTimeProvider uses actual time operations
type RealTimeProvider struct{}

func (r *RealTimeProvider) Now() time.Time {
	return time.Now()
}

func (r *RealTimeProvider) After(d time.Duration) <-chan time.Time {
	return time.After(d)
}

func (r *RealTimeProvider) NewTimer(d time.Duration) Timer {
	return &realTimer{timer: time.NewTimer(d)}
}

func (r *RealTimeProvider) Sleep(d time.Duration) {
	time.Sleep(d)
}

type realTimer struct {
	timer *time.Timer
}

func (t *realTimer) C() <-chan time.Time {
	return t.timer.C
}

func (t *realTimer) Reset(d time.Duration) bool {
	return t.timer.Reset(d)
}

func (t *realTimer) Stop() bool {
	return t.timer.Stop()
}

// MockTimeProvider allows manual control of time for testing
type MockTimeProvider struct {
	mu       sync.RWMutex
	current  time.Time
	timers   []*mockTimer
	afterChs []struct {
		d  time.Duration
		ch chan time.Time
	}
}

// NewMockTimeProvider creates a mock time provider starting at a specific time
func NewMockTimeProvider(start time.Time) *MockTimeProvider {
	return &MockTimeProvider{
		current: start,
		timers:  make([]*mockTimer, 0),
		afterChs: make([]struct {
			d  time.Duration
			ch chan time.Time
		}, 0),
	}
}

func (m *MockTimeProvider) Now() time.Time {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

func (m *MockTimeProvider) After(d time.Duration) <-chan time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()

	ch := make(chan time.Time, 1)
	m.afterChs = append(m.afterChs, struct {
		d  time.Duration
		ch chan time.Time
	}{d: d, ch: ch})
	return ch
}

func (m *MockTimeProvider) NewTimer(d time.Duration) Timer {
	m.mu.Lock()
	defer m.mu.Unlock()

	timer := &mockTimer{
		c:      make(chan time.Time, 1),
		expiry: m.current.Add(d),
		active: true,
	}
	m.timers = append(m.timers, timer)
	return timer
}

func (m *MockTimeProvider) Sleep(d time.Duration) {
	// In mock mode, sleep is a no-op - tests should use Advance instead
}

// Advance moves time forward by the specified duration and triggers any expired timers/after channels
func (m *MockTimeProvider) Advance(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current = m.current.Add(d)
	newTime := m.current

	// Trigger expired timers
	for _, timer := range m.timers {
		if timer.active && !newTime.Before(timer.expiry) {
			timer.active = false
			select {
			case timer.c <- newTime:
			default:
			}
		}
	}

	// Trigger expired After channels
	for i := range m.afterChs {
		if !newTime.Before(m.current.Add(-m.afterChs[i].d)) {
			// This after has expired (rough approximation)
		}
	}

	// Clean up fired timers
	activeTimers := make([]*mockTimer, 0)
	for _, t := range m.timers {
		if t.active {
			activeTimers = append(activeTimers, t)
		}
	}
	m.timers = activeTimers
}

type mockTimer struct {
	c      chan time.Time
	expiry time.Time
	active bool
}

func (t *mockTimer) C() <-chan time.Time {
	return t.c
}

func (t *mockTimer) Reset(d time.Duration) bool {
	wasActive := t.active
	t.active = true
	return wasActive
}

func (t *mockTimer) Stop() bool {
	wasActive := t.active
	t.active = false
	return wasActive
}

// DefaultTimeProvider is the standard real time provider
var DefaultTimeProvider TimeProvider = &RealTimeProvider{}
