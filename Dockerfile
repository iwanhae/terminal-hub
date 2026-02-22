# Multi-stage Dockerfile for Terminal Hub
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build-ci

# Stage 2: Build Go backend
FROM golang:1.26.0 AS backend-builder

WORKDIR /app

# Copy source code
COPY . .

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Build the Go binary
ENV CGO_ENABLED=0
RUN go build -o terminal-hub .

# Stage 3: Final runtime image
FROM ubuntu:24.04 AS base

RUN apt-get update && \
    apt-get install -y bash ca-certificates sudo vim git curl htop build-essential python3 python3-pip tmux

# Non essential tools
RUN apt-get install -y ripgrep fzf net-tools iproute2 dnsutils

# Create a non-root user for running the application
# Variables
ARG USERNAME=ubuntu

# Create the user
RUN echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
ENV HOME=/home/$USERNAME
WORKDIR $HOME

# Prepare dev environment

# Go
RUN ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/') && \
    curl -sSL "https://go.dev/dl/go1.26.0.linux-${ARCH}.tar.gz" | tar -C /usr/local -xz

# Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node & Bun
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
RUN bash -c "source $HOME/.nvm/nvm.sh && nvm install 24"
RUN curl -fsSL https://bun.com/install | bash

# Python
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="${HOME}/go/bin:${HOME}/.local/bin:/usr/local/go/bin:${PATH}"

# AI tools
RUN bash -c "source $HOME/.nvm/nvm.sh && npm install -g @charmland/crush @openai/codex @google/gemini-cli"
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN curl -fsSL https://opencode.ai/install | bash

# Github CLI
RUN (type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
    && sudo mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && sudo mkdir -p -m 755 /etc/apt/sources.list.d \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && sudo apt update \
    && sudo apt install gh -y

# Backup HOME directory contents for volume initialization
RUN sudo tar -czf /tmp/home-backup.tar.gz -C $HOME .
RUN sudo bash -c "rm -rf ${HOME} && mkdir ${HOME} && sudo chown $USERNAME:$USERNAME ${HOME}"

# Copy the binary from backend-builder
COPY --from=backend-builder /app/terminal-hub /usr/local/bin/terminal-hub

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

FROM scratch

COPY --from=base / /

ARG USERNAME=ubuntu
ENV HOME=/home/$USERNAME
WORKDIR $HOME
ENV PATH="${HOME}/go/bin:${HOME}/.local/bin:/usr/local/go/bin:${PATH}"

COPY tmux.conf $HOME/.tmux.conf

EXPOSE 8081

VOLUME [ ${HOME} ]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["-addr", ":8081"]
