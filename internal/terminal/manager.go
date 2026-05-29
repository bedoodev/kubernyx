package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

type DataEvent struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
}

type ExitEvent struct {
	SessionID string `json:"sessionId"`
	ExitCode  int    `json:"exitCode"`
	Error     string `json:"error,omitempty"`
}

type StatusEvent struct {
	SessionID string `json:"sessionId"`
	State     string `json:"state"`
	Message   string `json:"message,omitempty"`
}

type SessionConfig struct {
	SessionID string
	Command   string
	Args      []string
	Env       []string
	Dir       string
	Cols      int
	Rows      int
	Cleanup   func(context.Context) error
}

type EventHandlers struct {
	OnData   func(DataEvent)
	OnExit   func(ExitEvent)
	OnStatus func(StatusEvent)
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*session
	events   EventHandlers
}

type session struct {
	id          string
	ptyFile     *os.File
	cmd         *exec.Cmd
	cancel      context.CancelFunc
	cleanup     func(context.Context) error
	finishOnce  sync.Once
	closeSignal chan struct{}
}

func NewManager(events EventHandlers) *Manager {
	return &Manager{
		sessions: make(map[string]*session),
		events:   events,
	}
}

func (m *Manager) Start(config SessionConfig) error {
	sessionID := config.SessionID
	if sessionID == "" {
		return fmt.Errorf("session id is required")
	}
	if config.Command == "" {
		return fmt.Errorf("command is required")
	}
	if config.Cols <= 0 {
		config.Cols = 120
	}
	if config.Rows <= 0 {
		config.Rows = 32
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, config.Command, config.Args...)
	if len(config.Env) > 0 {
		cmd.Env = config.Env
	} else {
		cmd.Env = os.Environ()
	}
	if config.Dir != "" {
		cmd.Dir = config.Dir
	}

	ptyFile, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(config.Cols),
		Rows: uint16(config.Rows),
	})
	if err != nil {
		cancel()
		return fmt.Errorf("failed to start terminal process: %w", err)
	}

	nextSession := &session{
		id:          sessionID,
		ptyFile:     ptyFile,
		cmd:         cmd,
		cancel:      cancel,
		cleanup:     config.Cleanup,
		closeSignal: make(chan struct{}),
	}

	m.mu.Lock()
	if _, exists := m.sessions[sessionID]; exists {
		m.mu.Unlock()
		_ = ptyFile.Close()
		cancel()
		return fmt.Errorf("terminal session %q already exists", sessionID)
	}
	m.sessions[sessionID] = nextSession
	m.mu.Unlock()

	m.emitStatus(StatusEvent{
		SessionID: sessionID,
		State:     "connected",
	})

	go m.readLoop(nextSession)
	go m.waitLoop(nextSession)

	return nil
}

func (m *Manager) Write(sessionID string, data string) error {
	if data == "" {
		return nil
	}

	session, ok := m.getSession(sessionID)
	if !ok {
		return fmt.Errorf("terminal session %q not found", sessionID)
	}

	if _, err := io.WriteString(session.ptyFile, data); err != nil {
		return fmt.Errorf("failed to write terminal input: %w", err)
	}
	return nil
}

func (m *Manager) Resize(sessionID string, cols int, rows int) error {
	if cols <= 0 || rows <= 0 {
		return fmt.Errorf("terminal size must be positive")
	}

	session, ok := m.getSession(sessionID)
	if !ok {
		return fmt.Errorf("terminal session %q not found", sessionID)
	}

	if err := pty.Setsize(session.ptyFile, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	}); err != nil {
		return fmt.Errorf("failed to resize terminal: %w", err)
	}
	return nil
}

func (m *Manager) Close(sessionID string) error {
	session, ok := m.getSession(sessionID)
	if !ok {
		return nil
	}

	m.emitStatus(StatusEvent{
		SessionID: sessionID,
		State:     "cleaning-up",
	})
	session.cancel()
	_ = session.ptyFile.Close()
	return nil
}

func (m *Manager) CloseAll(ctx context.Context) {
	m.mu.RLock()
	ids := make([]string, 0, len(m.sessions))
	for sessionID := range m.sessions {
		ids = append(ids, sessionID)
	}
	m.mu.RUnlock()

	for _, sessionID := range ids {
		_ = m.Close(sessionID)
	}

	done := make(chan struct{})
	go func() {
		for {
			m.mu.RLock()
			remaining := len(m.sessions)
			m.mu.RUnlock()
			if remaining == 0 {
				close(done)
				return
			}
		}
	}()

	select {
	case <-done:
	case <-ctx.Done():
	}
}

func (m *Manager) readLoop(session *session) {
	buffer := make([]byte, 4096)
	for {
		n, err := session.ptyFile.Read(buffer)
		if n > 0 {
			m.emitData(DataEvent{
				SessionID: session.id,
				Data:      string(buffer[:n]),
			})
		}
		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
				m.emitData(DataEvent{
					SessionID: session.id,
					Data:      fmt.Sprintf("\r\n[terminal read error: %s]\r\n", err),
				})
			}
			return
		}
	}
}

func (m *Manager) waitLoop(session *session) {
	waitErr := session.cmd.Wait()
	exitCode := 0
	errorMessage := ""

	if waitErr != nil {
		var exitErr *exec.ExitError
		if errors.As(waitErr, &exitErr) {
			exitCode = exitErr.ExitCode()
			if exitCode < 0 {
				exitCode = 1
			}
		} else if !errors.Is(waitErr, context.Canceled) {
			exitCode = 1
			errorMessage = waitErr.Error()
		}
	}

	session.finishOnce.Do(func() {
		close(session.closeSignal)
		_ = session.ptyFile.Close()
		session.cancel()

		if session.cleanup != nil {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), defaultCleanupTimeout)
			if cleanupErr := session.cleanup(cleanupCtx); cleanupErr != nil && errorMessage == "" {
				errorMessage = cleanupErr.Error()
			}
			cancel()
		}

		m.mu.Lock()
		delete(m.sessions, session.id)
		m.mu.Unlock()

		m.emitExit(ExitEvent{
			SessionID: session.id,
			ExitCode:  exitCode,
			Error:     errorMessage,
		})
		m.emitStatus(StatusEvent{
			SessionID: session.id,
			State:     "closed",
		})
	})
}

func (m *Manager) getSession(sessionID string) (*session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, ok := m.sessions[sessionID]
	return session, ok
}

func (m *Manager) emitData(event DataEvent) {
	if m.events.OnData != nil {
		m.events.OnData(event)
	}
}

func (m *Manager) emitExit(event ExitEvent) {
	if m.events.OnExit != nil {
		m.events.OnExit(event)
	}
}

func (m *Manager) emitStatus(event StatusEvent) {
	if m.events.OnStatus != nil {
		m.events.OnStatus(event)
	}
}

const defaultCleanupTimeout = 10 * time.Second
