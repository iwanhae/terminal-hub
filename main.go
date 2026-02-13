package main

import "github.com/iwanhae/terminal-hub/internal/server"

var Version string // Set via ldflags during build

func main() {
	server.Run()
}
