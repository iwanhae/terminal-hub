package terminal

import (
	"io"
	"os"
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
			history.Write(data)

			retrieved := history.GetHistory()
			Expect(retrieved).To(Equal(data))
		})

		It("should truncate old data when size limit is exceeded", func() {
			history := NewInMemoryHistory(10)

			// Write more than the size limit
			history.Write([]byte("0123456789")) // 10 bytes
			history.Write([]byte("ABCDE"))      // 5 more bytes

			retrieved := history.GetHistory()
			// Should keep only the last 10 bytes
			Expect(string(retrieved)).To(Equal("56789ABCDE"))
			Expect(len(retrieved)).To(BeNumerically("<=", 10))
		})

		It("should handle single write larger than buffer size", func() {
			history := NewInMemoryHistory(5)

			history.Write([]byte("0123456789")) // 10 bytes, larger than buffer

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
			client.Send([]byte("test"))
			received := client.Receive(100 * time.Millisecond)
			Expect(received).To(Equal([]byte("test")))
		})

		It("should fail when closed", func() {
			client.Close()
			err := client.Send([]byte("test"))
			Expect(err).To(HaveOccurred())
		})
	})

	Context("When closing", func() {
		It("should mark client as closed", func() {
			Expect(client.IsClosed()).To(BeFalse())
			client.Close()
			Expect(client.IsClosed()).To(BeTrue())
		})

		It("should handle multiple close calls gracefully", func() {
			client.Close()
			err := client.Close()
			Expect(err).ToNot(HaveOccurred())
		})
	})
})
