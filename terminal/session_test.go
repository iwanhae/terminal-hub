package terminal

import (
	"io"
	"os"
	"os/exec"
	"sync"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestTerminalHub(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Terminal Hub Suite")
}

// MockWebSocketClient is a mock implementation of WebSocketClient for testing
type MockWebSocketClient struct {
	sendChan chan []byte
	closed   bool
	mu       sync.Mutex
}

func NewMockWebSocketClient() *MockWebSocketClient {
	return &MockWebSocketClient{
		sendChan: make(chan []byte, 256),
		closed:   false,
	}
}

func (m *MockWebSocketClient) Send(data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return io.ErrClosedPipe
	}

	select {
	case m.sendChan <- data:
		return nil
	default:
		return io.ErrClosedPipe
	}
}

func (m *MockWebSocketClient) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.closed {
		m.closed = true
		close(m.sendChan)
	}

	return nil
}

func (m *MockWebSocketClient) Receive(timeout time.Duration) []byte {
	select {
	case data := <-m.sendChan:
		return data
	case <-time.After(timeout):
		return nil
	}
}

func (m *MockWebSocketClient) IsClosed() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.closed
}

// MockPTYService is a mock implementation of PTYService for testing
type MockPTYService struct {
	startCalled bool
	startError  error
	startReturn *os.File

	setSizeCalled bool
	setSizeCols   int
	setSizeRows   int
	setSizeError  error
}

func (m *MockPTYService) Start(shell string) (*os.File, error) {
	m.startCalled = true
	if m.startError != nil {
		return nil, m.startError
	}
	return m.startReturn, nil
}

func (m *MockPTYService) SetSize(file *os.File, cols, rows int) error {
	m.setSizeCalled = true
	m.setSizeCols = cols
	m.setSizeRows = rows
	return m.setSizeError
}

var _ = Describe("InMemoryHistory", func() {
	Context("When created with a size limit", func() {
		It("should create a new history buffer", func() {
			history := NewInMemoryHistory(100)
			Expect(history).NotTo(BeNil())
		})

		It("should write data within the size limit", func() {
			history := NewInMemoryHistory(100)
			n, err := history.Write([]byte("hello"))
			Expect(err).ToNot(HaveOccurred())
			Expect(n).To(Equal(5))
		})

		It("should retrieve written history", func() {
			history := NewInMemoryHistory(100)
			data := []byte("test data")
			_, err := history.Write(data)
			Expect(err).ToNot(HaveOccurred())

			retrieved := history.GetHistory()
			Expect(retrieved).To(Equal(data))
		})

		It("should truncate old data when size limit is exceeded", func() {
			history := NewInMemoryHistory(10)

			// Write more than the size limit
			_, err := history.Write([]byte("0123456789")) // 10 bytes
			Expect(err).ToNot(HaveOccurred())
			_, err = history.Write([]byte("ABCDE")) // 5 more bytes
			Expect(err).ToNot(HaveOccurred())

			retrieved := history.GetHistory()
			// Should keep only the last 10 bytes
			Expect(string(retrieved)).To(Equal("56789ABCDE"))
			Expect(len(retrieved)).To(BeNumerically("<=", 10))
		})

		It("should handle single write larger than buffer size", func() {
			history := NewInMemoryHistory(5)

			_, err := history.Write([]byte("0123456789")) // 10 bytes, larger than buffer
			Expect(err).ToNot(HaveOccurred())

			retrieved := history.GetHistory()
			// Should keep only the last 5 bytes
			Expect(string(retrieved)).To(Equal("56789"))
		})
	})
})

var _ = Describe("SessionManager", func() {
	var manager *SessionManager

	BeforeEach(func() {
		manager = NewSessionManager()
	})

	Context("When created", func() {
		It("should have no sessions", func() {
			Expect(manager.SessionCount()).To(Equal(0))
		})

		It("should return an empty list of sessions", func() {
			sessions := manager.ListSessions()
			Expect(sessions).To(BeEmpty())
		})
	})

	Context("When getting a non-existent session", func() {
		It("should return not found", func() {
			sess, ok := manager.Get("nonexistent")
			Expect(ok).To(BeFalse())
			Expect(sess).To(BeNil())
		})
	})

	Context("When removing a session", func() {
		It("should return error for non-existent session", func() {
			err := manager.Remove("nonexistent")
			Expect(err).To(HaveOccurred())
		})
	})

	Context("When closing all sessions", func() {
		It("should successfully close with no sessions", func() {
			err := manager.CloseAll()
			Expect(err).ToNot(HaveOccurred())
		})
	})
})

var _ = Describe("MockWebSocketClient", func() {
	var client *MockWebSocketClient

	BeforeEach(func() {
		client = NewMockWebSocketClient()
	})

	Context("When sending data", func() {
		It("should successfully send to channel", func() {
			err := client.Send([]byte("test"))
			Expect(err).ToNot(HaveOccurred())
		})

		It("should receive data from channel", func() {
			err := client.Send([]byte("test"))
			Expect(err).ToNot(HaveOccurred())
			received := client.Receive(100 * time.Millisecond)
			Expect(received).To(Equal([]byte("test")))
		})

		It("should fail when closed", func() {
			closeErr := client.Close()
			Expect(closeErr).ToNot(HaveOccurred())
			err := client.Send([]byte("test"))
			Expect(err).To(HaveOccurred())
		})
	})

	Context("When closing", func() {
		It("should mark client as closed", func() {
			Expect(client.IsClosed()).To(BeFalse())
			err := client.Close()
			Expect(err).ToNot(HaveOccurred())
			Expect(client.IsClosed()).To(BeTrue())
		})

		It("should handle multiple close calls gracefully", func() {
			closeErr := client.Close()
			Expect(closeErr).ToNot(HaveOccurred())
			err := client.Close()
			Expect(err).ToNot(HaveOccurred())
		})
	})
})

// SimulatedPTYService implements PTYService with a pipe for testing race conditions
type SimulatedPTYService struct {
	ptyReader *os.File
	ptyWriter *os.File
	cmd       *exec.Cmd
}

func NewSimulatedPTYService() (*SimulatedPTYService, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	return &SimulatedPTYService{
		ptyReader: reader,
		ptyWriter: writer,
	}, nil
}

func (s *SimulatedPTYService) Start(shell string) (*os.File, error) {
	return s.ptyReader, nil
}

func (s *SimulatedPTYService) StartWithConfig(shell string, workingDir string, envVars map[string]string) (*os.File, *exec.Cmd, error) {
	return s.ptyReader, nil, nil
}

func (s *SimulatedPTYService) SetSize(file *os.File, cols, rows int) error {
	return nil
}

// SimulateOutput writes data to simulate PTY output during testing
func (s *SimulatedPTYService) SimulateOutput(data []byte) error {
	_, err := s.ptyWriter.Write(data)
	return err
}

// Close closes the pipe
func (s *SimulatedPTYService) Close() error {
	return s.ptyWriter.Close()
}

var _ = Describe("TerminalSession Race Conditions", func() {
	Context("When concurrently closing and broadcasting", func() {
		It("should not panic on rapid Close() during active readPTY", func() {
			// Create a simulated PTY service
			ptySvc, err := NewSimulatedPTYService()
			Expect(err).ToNot(HaveOccurred())

			// Create a session with the simulated PTY
			session := &TerminalSession{
				id:      "test-race-session",
				ptyFile: ptySvc.ptyReader,
				history: NewInMemoryHistory(4096),
				ptySvc:  ptySvc,
				metadata: SessionMetadata{
					Name:           "race-test",
					CreatedAt:      time.Now(),
					LastActivityAt: time.Now(),
					ClientCount:    0,
				},
				termCols:       80,
				termRows:       24,
				clients:        make(map[WebSocketClient]bool),
				broadcast:      make(chan []byte, 256),
				orderedClients: make([]WebSocketClient, 0),
				closed:         false,
			}

			// Start the readPTY goroutine
			go session.readPTY()

			// Simulate PTY output in a goroutine
			done := make(chan bool)
			go func() {
				for i := 0; i < 100; i++ {
					ptySvc.SimulateOutput([]byte("test output\n"))
					time.Sleep(1 * time.Millisecond)
				}
				done <- true
			}()

			// Rapidly close the session while output is happening
			// This used to cause "send on closed channel" panic
			for i := 0; i < 50; i++ {
				// Recreate the broadcast channel after each close attempt
				// (normally we wouldn't do this, but for testing the race condition)
				session.closeMu.Lock()
				if !session.closed {
					session.closed = true
				}
				session.closeMu.Unlock()

				// Try to trigger the race by checking and sending
				session.closeMu.Lock()
				if !session.closed {
					select {
					case session.broadcast <- []byte("test"):
					default:
					}
				}
				session.closeMu.Unlock()

				time.Sleep(100 * time.Microsecond)
			}

			// Clean close
			session.Close()
			ptySvc.Close()

			// Wait for output to finish
			Eventually(done, 2*time.Second).Should(Receive(BeTrue()))

			// If we get here without panic, the race condition is fixed
			Expect(true).To(BeTrue())
		})

		It("should handle concurrent Close() calls safely", func() {
			ptySvc, err := NewSimulatedPTYService()
			Expect(err).ToNot(HaveOccurred())

			session := &TerminalSession{
				id:      "test-concurrent-close",
				ptyFile: ptySvc.ptyReader,
				history: NewInMemoryHistory(4096),
				ptySvc:  ptySvc,
				metadata: SessionMetadata{
					Name:           "concurrent-close-test",
					CreatedAt:      time.Now(),
					LastActivityAt: time.Now(),
					ClientCount:    0,
				},
				termCols:       80,
				termRows:       24,
				clients:        make(map[WebSocketClient]bool),
				broadcast:      make(chan []byte, 256),
				orderedClients: make([]WebSocketClient, 0),
				closed:         false,
			}

			go session.readPTY()

			// Simulate some output
			go func() {
				for i := 0; i < 50; i++ {
					ptySvc.SimulateOutput([]byte("output\n"))
					time.Sleep(2 * time.Millisecond)
				}
			}()

			// Close from multiple goroutines concurrently
			var wg sync.WaitGroup
			for i := 0; i < 10; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					session.Close()
				}()
			}

			// Should complete without panic or deadlock
			wg.Wait()
			ptySvc.Close()

			// Verify session is closed
			session.closeMu.RLock()
			closed := session.closed
			session.closeMu.RUnlock()
			Expect(closed).To(BeTrue())
		})

		It("should stress test readPTY and Close() with race detector", func() {
			// Run many iterations to increase chance of catching race conditions
			iterations := 20
			for iter := 0; iter < iterations; iter++ {
				ptySvc, err := NewSimulatedPTYService()
				Expect(err).ToNot(HaveOccurred())

				session := &TerminalSession{
					id:      "test-stress",
					ptyFile: ptySvc.ptyReader,
					history: NewInMemoryHistory(4096),
					ptySvc:  ptySvc,
					metadata: SessionMetadata{
						Name:           "stress-test",
						CreatedAt:      time.Now(),
						LastActivityAt: time.Now(),
						ClientCount:    0,
					},
					termCols:       80,
					termRows:       24,
					clients:        make(map[WebSocketClient]bool),
					broadcast:      make(chan []byte, 256),
					orderedClients: make([]WebSocketClient, 0),
					closed:         false,
				}

				go session.readPTY()

				// Rapid fire output and close
				for i := 0; i < 10; i++ {
					ptySvc.SimulateOutput([]byte("stress test data\n"))
					time.Sleep(time.Microsecond)
				}

				// Close immediately
				session.Close()
				ptySvc.Close()

				// Give goroutines time to finish
				time.Sleep(time.Millisecond)
			}

			// If we complete all iterations without panic, race condition is fixed
			Expect(true).To(BeTrue())
		})
	})
})

var _ = Describe("Rate Limiting DoS Protection", func() {
	Context("When session produces excessive output", func() {
		It("should not hang server on continuous output like 'cat /dev/random'", func() {
			// Create a simulated PTY service
			ptySvc, err := NewSimulatedPTYService()
			Expect(err).ToNot(HaveOccurred())

			session := &TerminalSession{
				id:      "test-dos-protection",
				ptyFile: ptySvc.ptyReader,
				history: NewInMemoryHistory(4096),
				ptySvc:  ptySvc,
				metadata: SessionMetadata{
					Name:           "dos-test",
					CreatedAt:      time.Now(),
					LastActivityAt: time.Now(),
					ClientCount:    0,
				},
				termCols:       80,
				termRows:       24,
				clients:        make(map[WebSocketClient]bool),
				broadcast:      make(chan []byte, 256),
				orderedClients: make([]WebSocketClient, 0),
				closed:         false,
				outputRateLimit: make(chan struct{}, 500),
			}

			go session.readPTY()
			go session.broadcastLoop()

			// Create a slow client that doesn't read from the channel
			slowClient := &MockWebSocketClient{
				sendChan: make(chan []byte, 1), // Small buffer to cause slow sends
				closed:   false,
			}
			session.AddClient(slowClient)

			// Create a normal client
			normalClient := NewMockWebSocketClient()
			session.AddClient(normalClient)

			// Simulate continuous output (like cat /dev/random)
			// Generate output at high rate for 2 seconds
			done := make(chan bool)
			go func() {
				for i := 0; i < 10000; i++ {
					ptySvc.SimulateOutput([]byte("random data output "))
				}
				done <- true
			}()

			// The key test: verify that we don't hang
			// The server should still be responsive after excessive output
			select {
			case <-done:
				// Good - output generation completed
			case <-time.After(2 * time.Second):
				// Bad - the server hung
				Fail("Server hung on excessive output")
			}

			// Verify that the slow client was removed due to being overwhelmed
			Eventually(func() bool {
				return slowClient.IsClosed()
			}, 2*time.Second).Should(BeTrue(), "Slow client should be removed")

			// Verify that normal client can still receive data
			Eventually(func() int {
				return len(normalClient.sendChan)
			}, 1*time.Second).Should(BeNumerically(">", 0), "Normal client should receive data")

			// Clean up
			session.Close()
			ptySvc.Close()
		})

		It("should drop messages when rate limit is exceeded", func() {
			ptySvc, err := NewSimulatedPTYService()
			Expect(err).ToNot(HaveOccurred())

			session := &TerminalSession{
				id:      "test-rate-limit",
				ptyFile: ptySvc.ptyReader,
				history: NewInMemoryHistory(4096),
				ptySvc:  ptySvc,
				metadata: SessionMetadata{
					Name:           "rate-limit-test",
					CreatedAt:      time.Now(),
					LastActivityAt: time.Now(),
					ClientCount:    0,
				},
				termCols:       80,
				termRows:       24,
				clients:        make(map[WebSocketClient]bool),
				broadcast:      make(chan []byte, 256),
				orderedClients: make([]WebSocketClient, 0),
				closed:         false,
				outputRateLimit: make(chan struct{}, 500),
			}

			go session.readPTY()
			go session.broadcastLoop()

			client := NewMockWebSocketClient()
			session.AddClient(client)

			// Fill the rate limit bucket
			for i := 0; i < 500; i++ {
				session.outputRateLimit <- struct{}{}
			}

			// Simulate output faster than rate limit
			// These should trigger the rate limit
			for i := 0; i < 100; i++ {
				ptySvc.SimulateOutput([]byte("test data "))
				time.Sleep(100 * time.Microsecond)
			}

			// Wait a bit
			time.Sleep(20 * time.Millisecond)

			// The client should receive some messages but not all (rate limited)
			// The exact number depends on timing, but should be reasonable
			receivedCount := len(client.sendChan)
			// With rate limit of 500/sec and 100 messages over ~10ms, 
			// we should receive less than all messages
			Expect(receivedCount).To(BeNumerically("<", 100), "Rate limiting should drop some messages")

			session.Close()
			ptySvc.Close()
		})

		It("should recover and continue after rate limit subsides", func() {
			ptySvc, err := NewSimulatedPTYService()
			Expect(err).ToNot(HaveOccurred())

			session := &TerminalSession{
				id:      "test-rate-limit-recovery",
				ptyFile: ptySvc.ptyReader,
				history: NewInMemoryHistory(4096),
				ptySvc:  ptySvc,
				metadata: SessionMetadata{
					Name:           "rate-limit-recovery-test",
					CreatedAt:      time.Now(),
					LastActivityAt: time.Now(),
					ClientCount:    0,
				},
				termCols:       80,
				termRows:       24,
				clients:        make(map[WebSocketClient]bool),
				broadcast:      make(chan []byte, 256),
				orderedClients: make([]WebSocketClient, 0),
				closed:         false,
				outputRateLimit: make(chan struct{}, 500),
			}

			go session.readPTY()
			go session.broadcastLoop()

			// Use a client with a large buffer to avoid being removed during burst
			client := &MockWebSocketClient{
				sendChan: make(chan []byte, 1000),
				closed:   false,
			}
			session.AddClient(client)

			// Burst of output to trigger rate limiting
			for i := 0; i < 600; i++ {
				ptySvc.SimulateOutput([]byte("burst "))
				time.Sleep(1 * time.Microsecond)
			}

			// Wait for rate limit to recover
			time.Sleep(50 * time.Millisecond)

			// Clear the channel
			for len(client.sendChan) > 0 {
				<-client.sendChan
			}

			// Send normal output
			ptySvc.SimulateOutput([]byte("normal output "))

			// Verify we can receive normal output after rate limiting subsides
			received := client.Receive(1 * time.Second)
			Expect(received).NotTo(BeNil(), "Should receive data after rate limit recovers")
			Expect(string(received)).To(Equal("normal output "))

			session.Close()
			ptySvc.Close()
		})
	})
})
