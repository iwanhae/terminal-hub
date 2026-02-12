package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// PasswordFile represents the structure of the credentials file
type PasswordFile struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash,omitempty"`
	Password     string `json:"password,omitempty"` // Legacy: plain text for auto-migration
	Version      int    `json:"version"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

// currentPasswordFileVersion is the current version of the password file format
const currentPasswordFileVersion = 1

// isBcryptHash checks if a string is a bcrypt hash
// bcrypt hashes start with $2a$, $2b$, or $2y$
func isBcryptHash(s string) bool {
	return strings.HasPrefix(s, "$2a$") ||
		strings.HasPrefix(s, "$2b$") ||
		strings.HasPrefix(s, "$2y$")
}

// LoadCredentials loads credentials from a password file
// If the file contains a plain text password, it automatically hashes it and saves back
// Returns username, password hash, and error
func LoadCredentials(filePath string) (username, passwordHash string, err error) {
	// Ensure directory exists with secure permissions
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", "", fmt.Errorf("failed to create credentials directory: %w", err)
	}

	// Read the password file
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", "", fmt.Errorf("password file not found: %s", filePath)
		}
		return "", "", fmt.Errorf("failed to read password file: %w", err)
	}

	// Check file permissions (should be 0600)
	info, err := os.Stat(filePath)
	if err != nil {
		return "", "", fmt.Errorf("failed to stat password file: %w", err)
	}
	// Warn if permissions are too open
	if info.Mode().Perm()&0077 != 0 {
		// Log warning but don't fail - the file might have been created externally
		fmt.Printf("Warning: password file %s has overly permissive permissions (%v), recommend 0600\n",
			filePath, info.Mode().Perm())
	}

	var pwFile PasswordFile
	if err := json.Unmarshal(data, &pwFile); err != nil {
		return "", "", fmt.Errorf("failed to parse password file: %w", err)
	}

	// Validate username
	if pwFile.Username == "" {
		return "", "", fmt.Errorf("password file missing username")
	}

	// Check if we have a password hash or plain text password
	if pwFile.PasswordHash != "" && isBcryptHash(pwFile.PasswordHash) {
		// Already hashed, return as-is
		return pwFile.Username, pwFile.PasswordHash, nil
	}

	// Check for legacy plain text password
	if pwFile.Password != "" {
		// Auto-migrate: hash the plain text password
		hash, err := bcrypt.GenerateFromPassword([]byte(pwFile.Password), bcrypt.DefaultCost)
		if err != nil {
			return "", "", fmt.Errorf("failed to hash password: %w", err)
		}

		// Update the file with the hashed password
		updatedFile := PasswordFile{
			Username:     pwFile.Username,
			PasswordHash: string(hash),
			Version:      currentPasswordFileVersion,
			UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
		}

		if err := savePasswordFile(filePath, &updatedFile); err != nil {
			return "", "", fmt.Errorf("failed to save hashed password: %w", err)
		}

		fmt.Printf("Password file auto-migrated: plain text password hashed and saved\n")
		return updatedFile.Username, updatedFile.PasswordHash, nil
	}

	// Check for password_hash field that's not a valid bcrypt hash
	if pwFile.PasswordHash != "" {
		return "", "", fmt.Errorf("password_hash is not a valid bcrypt hash (must start with $2a$, $2b$, or $2y$)")
	}

	return "", "", fmt.Errorf("password file missing password or password_hash field")
}

// savePasswordFile atomically saves the password file
func savePasswordFile(filePath string, pwFile *PasswordFile) error {
	// Ensure directory exists with secure permissions
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create credentials directory: %w", err)
	}

	data, err := json.MarshalIndent(pwFile, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal password file: %w", err)
	}

	// Atomic write: temp file + rename
	tmpFile := filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}

	if err := os.Rename(tmpFile, filePath); err != nil {
		// Clean up temp file on failure
		os.Remove(tmpFile)
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	return nil
}

// ValidatePassword checks if the provided password matches the hash
// Uses bcrypt's constant-time comparison
func ValidatePassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// HashPassword generates a bcrypt hash from a plain text password
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	return string(hash), nil
}

// CreateCredentialsFile creates a credentials file at the default location
// with bcrypt-hashed password. Only creates if file doesn't exist.
// Returns the path where file was created, or empty string if skipped.
func CreateCredentialsFile(username, password string) (string, error) {
	defaultPath, err := DefaultPasswordFilePath()
	if err != nil {
		return "", fmt.Errorf("failed to get default password file path: %w", err)
	}

	// Check if file already exists - don't overwrite
	if _, err := os.Stat(defaultPath); err == nil {
		return "", nil // File exists, skip
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("failed to check for existing password file: %w", err)
	}

	// Hash the password
	passwordHash, err := HashPassword(password)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	// Create the password file structure
	pwFile := &PasswordFile{
		Username:     username,
		PasswordHash: passwordHash,
		Version:      currentPasswordFileVersion,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	if err := savePasswordFile(defaultPath, pwFile); err != nil {
		return "", fmt.Errorf("failed to save password file: %w", err)
	}

	return defaultPath, nil
}

// DefaultPasswordFilePath returns the default path for the password file
// Uses ~/.terminal-hub/credentials.json
func DefaultPasswordFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(homeDir, ".terminal-hub", "credentials.json"), nil
}
