package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"

	"kubernyx-app/internal/cluster"
	"kubernyx-app/internal/terminal"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type PortForwardRequest struct {
	ClusterFilename string `json:"clusterFilename"`
	Namespace       string `json:"namespace"`
	ResourceKind    string `json:"resourceKind"`
	ResourceName    string `json:"resourceName"`
	LocalPort       int    `json:"localPort"`
	RemotePort      int    `json:"remotePort"`
}

type PortForwardSession struct {
	ID              string `json:"id"`
	ClusterFilename string `json:"clusterFilename"`
	Namespace       string `json:"namespace"`
	ResourceKind    string `json:"resourceKind"`
	ResourceName    string `json:"resourceName"`
	LocalPort       int    `json:"localPort"`
	RemotePort      int    `json:"remotePort"`
	Command         string `json:"command"`
	Status          string `json:"status"`
	Message         string `json:"message"`
	StartedAtUnix   int64  `json:"startedAtUnix"`
}

type portForwardProcess struct {
	session PortForwardSession
	cancel  context.CancelFunc
	cmd     *exec.Cmd
}

func normalizePortForwardKind(kind string) (string, string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "po", "pod", "pods":
		return "pod", "pod", nil
	case "svc", "service", "services":
		return "service", "svc", nil
	case "deploy", "deployment", "deployments":
		return "deployment", "deployment", nil
	default:
		return "", "", fmt.Errorf("unsupported port-forward resource kind %q", kind)
	}
}

func validatePortForwardPort(label string, value int) error {
	if value < 1 || value > 65535 {
		return fmt.Errorf("%s port must be between 1 and 65535", label)
	}
	return nil
}

func (a *App) emitPortForwardEvent(session PortForwardSession) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "port-forward-status", session)
}

func (a *App) portForwardSnapshotLocked(process *portForwardProcess) PortForwardSession {
	if process == nil {
		return PortForwardSession{}
	}
	return process.session
}

func (a *App) updatePortForwardStatus(id string, status string, message string, emit bool) (PortForwardSession, bool) {
	a.portForwardMu.Lock()
	process, ok := a.portForwards[id]
	if !ok {
		a.portForwardMu.Unlock()
		return PortForwardSession{}, false
	}
	process.session.Status = status
	process.session.Message = strings.TrimSpace(message)
	session := a.portForwardSnapshotLocked(process)
	a.portForwardMu.Unlock()

	if emit {
		a.emitPortForwardEvent(session)
	}
	return session, true
}

func (a *App) removePortForward(id string, status string, message string) {
	a.portForwardMu.Lock()
	process, ok := a.portForwards[id]
	if !ok {
		a.portForwardMu.Unlock()
		return
	}
	process.session.Status = status
	if nextMessage := strings.TrimSpace(message); nextMessage != "" {
		process.session.Message = nextMessage
	}
	session := a.portForwardSnapshotLocked(process)
	delete(a.portForwards, id)
	a.portForwardMu.Unlock()

	a.emitPortForwardEvent(session)
}

func (a *App) hasActivePortForwardConflict(localPort int) bool {
	a.portForwardMu.Lock()
	defer a.portForwardMu.Unlock()

	for _, process := range a.portForwards {
		if process.session.LocalPort != localPort {
			continue
		}
		switch process.session.Status {
		case "starting", "running", "stopping":
			return true
		}
	}
	return false
}

func (a *App) scanPortForwardOutput(ctx context.Context, id string, scanner *bufio.Scanner) {
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.Contains(lower, "forwarding from") {
			a.updatePortForwardStatus(id, "running", line, true)
			continue
		}
		if strings.Contains(lower, "error") || strings.Contains(lower, "unable to listen") {
			a.updatePortForwardStatus(id, "failed", line, true)
			continue
		}
		a.updatePortForwardStatus(id, "starting", line, true)
	}

	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		a.updatePortForwardStatus(id, "failed", err.Error(), true)
	}
}

func (a *App) waitForPortForward(ctx context.Context, id string, cmd *exec.Cmd) {
	err := cmd.Wait()
	if ctx.Err() != nil {
		a.removePortForward(id, "stopped", "Port forward stopped")
		return
	}
	if err == nil {
		a.removePortForward(id, "stopped", "Port forward exited")
		return
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		message := strings.TrimSpace(string(exitErr.Stderr))
		if message == "" {
			message = exitErr.Error()
		}
		a.removePortForward(id, "failed", message)
		return
	}
	a.removePortForward(id, "failed", err.Error())
}

// StartPortForward starts a kubectl port-forward process and keeps it alive until stopped.
func (a *App) StartPortForward(request PortForwardRequest) (*PortForwardSession, error) {
	if a.cfg == nil {
		return nil, fmt.Errorf("not configured")
	}

	filename := strings.TrimSpace(request.ClusterFilename)
	namespace := strings.TrimSpace(request.Namespace)
	resourceName := strings.TrimSpace(request.ResourceName)
	resourceKind, resourceArgKind, err := normalizePortForwardKind(request.ResourceKind)
	if err != nil {
		return nil, err
	}
	if filename == "" {
		return nil, fmt.Errorf("cluster filename is required")
	}
	if namespace == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if resourceName == "" {
		return nil, fmt.Errorf("resource name is required")
	}
	if err := validatePortForwardPort("local", request.LocalPort); err != nil {
		return nil, err
	}
	if err := validatePortForwardPort("remote", request.RemotePort); err != nil {
		return nil, err
	}
	if a.hasActivePortForwardConflict(request.LocalPort) {
		return nil, fmt.Errorf("local port %d is already being forwarded", request.LocalPort)
	}

	kubeconfigPath, err := cluster.GetKubeconfigPath(a.cfg.BasePath, filename)
	if err != nil {
		return nil, err
	}

	baseCtx := a.ctx
	if baseCtx == nil {
		baseCtx = context.Background()
	}
	ctx, cancel := context.WithCancel(baseCtx)
	resourceRef := fmt.Sprintf("%s/%s", resourceArgKind, resourceName)
	portMapping := fmt.Sprintf("%d:%d", request.LocalPort, request.RemotePort)
	args := []string{
		"--kubeconfig", kubeconfigPath,
		"-n", namespace,
		"port-forward",
		resourceRef,
		portMapping,
		"--address", "127.0.0.1",
	}
	commandText := fmt.Sprintf("kubectl -n %s port-forward %s %s --address 127.0.0.1", namespace, resourceRef, portMapping)
	cmd := exec.CommandContext(ctx, terminal.ResolveExecutable("kubectl"), args...)
	cmd.Env = terminal.BuildEnv(kubeconfigPath)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	id := fmt.Sprintf("pf-%d", time.Now().UnixNano())
	session := PortForwardSession{
		ID:              id,
		ClusterFilename: filename,
		Namespace:       namespace,
		ResourceKind:    resourceKind,
		ResourceName:    resourceName,
		LocalPort:       request.LocalPort,
		RemotePort:      request.RemotePort,
		Command:         commandText,
		Status:          "starting",
		Message:         "Starting port forward",
		StartedAtUnix:   time.Now().Unix(),
	}

	a.portForwardMu.Lock()
	a.portForwards[id] = &portForwardProcess{
		session: session,
		cancel:  cancel,
		cmd:     cmd,
	}
	a.portForwardMu.Unlock()
	a.emitPortForwardEvent(session)

	go a.scanPortForwardOutput(ctx, id, bufio.NewScanner(stdout))
	go a.scanPortForwardOutput(ctx, id, bufio.NewScanner(stderr))
	go a.waitForPortForward(ctx, id, cmd)

	return &session, nil
}

// StopPortForward stops a running kubectl port-forward process.
func (a *App) StopPortForward(sessionID string) (*PortForwardSession, error) {
	id := strings.TrimSpace(sessionID)
	if id == "" {
		return nil, fmt.Errorf("session id is required")
	}

	a.portForwardMu.Lock()
	process, ok := a.portForwards[id]
	if !ok {
		a.portForwardMu.Unlock()
		return nil, fmt.Errorf("port forward session not found")
	}
	process.session.Status = "stopping"
	process.session.Message = "Stopping port forward"
	session := a.portForwardSnapshotLocked(process)
	cancel := process.cancel
	a.portForwardMu.Unlock()

	a.emitPortForwardEvent(session)
	if cancel != nil {
		cancel()
	}
	return &session, nil
}

// ListPortForwards returns active port-forward sessions for the current app process.
func (a *App) ListPortForwards() ([]PortForwardSession, error) {
	a.portForwardMu.Lock()
	defer a.portForwardMu.Unlock()

	items := make([]PortForwardSession, 0, len(a.portForwards))
	for _, process := range a.portForwards {
		items = append(items, process.session)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].StartedAtUnix > items[j].StartedAtUnix
	})
	return items, nil
}

func (a *App) stopAllPortForwards() {
	a.portForwardMu.Lock()
	processes := make([]*portForwardProcess, 0, len(a.portForwards))
	for _, process := range a.portForwards {
		processes = append(processes, process)
	}
	a.portForwardMu.Unlock()

	for _, process := range processes {
		if process != nil && process.cancel != nil {
			process.cancel()
		}
	}
}
