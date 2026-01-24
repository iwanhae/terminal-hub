.DEFAULT_GOAL := run

# Variables
BINARY_NAME=terminal-hub
BUILD_DIR=build
GO=go
GINKGO=ginkgo
GOFILES=$(shell find . -name '*.go' -type f)
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS=-ldflags "-X main.Version=$(VERSION)"


.PHONY: run
run: build-frontend build
	./$(BUILD_DIR)/$(BINARY_NAME)

## run: Run the application
.PHONY: run
run: build
	@echo "Running $(BINARY_NAME)..."
	./$(BUILD_DIR)/$(BINARY_NAME)

## build-frontend: Build the React frontend
.PHONY: build-frontend
build-frontend:
	@echo "Building React frontend..."
	@cd frontend && npm run build
	@echo "Frontend build complete"

.PHONY: build-backend
build-backend: build-frontend
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	$(GO) build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)"

## build: Build the application
.PHONY: build
build: build-backend build-frontend
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)

## test: Run all tests
.PHONY: test
test:
	@echo "Running tests..."
	$(GO) test -v ./...

## test-short: Run short tests only
.PHONY: test-short
test-short:
	@echo "Running short tests..."
	$(GO) test -short -v ./...

## test-coverage: Run tests with coverage report
.PHONY: test-coverage
test-coverage:
	@echo "Running tests with coverage..."
	$(GO) test -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

## test-ginkgo: Run tests using ginkgo
.PHONY: test-ginkgo
test-ginkgo:
	@echo "Running ginkgo tests..."
	$(GINKGO) -v --randomize-all --fail-on-pending ./...

## test-watch: Watch for changes and re-run tests
.PHONY: test-watch
test-watch:
	@echo "Watching for changes..."
	$(GINKGO) watch -v ./...

## clean: Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -f $(BINARY_NAME)
	@rm -f coverage.out coverage.html
	@echo "Clean complete"

## deps: Install dependencies
.PHONY: deps
deps:
	@echo "Installing dependencies..."
	$(GO) mod download
	$(GO) mod verify
	@echo "Dependencies installed"

## deps-tools: Install development tools
.PHONY: deps-tools
deps-tools:
	@echo "Installing development tools..."
	$(GO) install github.com/onsi/ginkgo/v2/ginkgo@latest
	$(GO) install github.com/cosmtrek/air@latest
	$(GO) install golang.org/x/tools/cmd/goimports@latest
	$(GO) install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@echo "Development tools installed"

## fmt: Format code
.PHONY: fmt
fmt:
	@echo "Formatting code..."
	$(GO) fmt ./...
	@command -v goimports >/dev/null 2>&1 && goimports -w . || true
	@echo "Code formatted"

## lint: Run linters
.PHONY: lint
lint:
	@echo "Running linters..."
	@command -v golangci-lint >/dev/null 2>&1 || { \
		echo "golangci-lint is not installed. Install it with:"; \
		echo "  make deps-tools"; \
		exit 1; \
	}
	golangci-lint run ./...

## vet: Run go vet
.PHONY: vet
vet:
	@echo "Running go vet..."
	$(GO) vet ./...

## check: Run all checks (fmt, vet, lint, test)
.PHONY: check
check: fmt vet lint test
	@echo "All checks passed!"

## help: Show this help message
.PHONY: help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@sed -n 's/^##//p' ${MAKEFILE_LIST} | column -t -s ':' | sed -e 's/^/ /'
