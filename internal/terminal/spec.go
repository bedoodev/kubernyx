package terminal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type TargetKind string

const (
	TargetKindCluster TargetKind = "cluster"
	TargetKindPod     TargetKind = "pod"
	TargetKindNode    TargetKind = "node"
)

type Target struct {
	Kind      TargetKind `json:"kind"`
	Filename  string     `json:"filename"`
	Namespace string     `json:"namespace,omitempty"`
	PodName   string     `json:"podName,omitempty"`
	Container string     `json:"container,omitempty"`
	NodeName  string     `json:"nodeName,omitempty"`
}

type CommandSpec struct {
	Command string
	Args    []string
	Env     []string
	Dir     string
}

func buildInteractiveShellBootstrap() string {
	return `if command -v bash >/dev/null 2>&1; then export CLICOLOR=0 CLICOLOR_FORCE=0 NO_COLOR=1 LS_COLORS=''; export PS1='\u@\h:\w\$ '; exec bash --noprofile --norc -i; elif command -v ash >/dev/null 2>&1; then export PS1='# '; exec ash -i; else export PS1='# '; exec sh -i; fi`
}

func buildTerminalEnv(kubeconfigPath string) []string {
	return append(os.Environ(),
		fmt.Sprintf("KUBECONFIG=%s", kubeconfigPath),
		"TERM=xterm-256color",
		fmt.Sprintf("PATH=%s", buildTerminalPath()),
	)
}

func buildTerminalPath() string {
	parts := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/local/go/bin",
		filepath.Join(userHomeDir(), "go", "bin"),
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	}
	if existing := strings.TrimSpace(os.Getenv("PATH")); existing != "" {
		parts = append(parts, strings.Split(existing, string(os.PathListSeparator))...)
	}

	seen := make(map[string]struct{}, len(parts))
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, ok := seen[part]; ok {
			continue
		}
		seen[part] = struct{}{}
		normalized = append(normalized, part)
	}
	return strings.Join(normalized, string(os.PathListSeparator))
}

func resolveExecutable(name string) string {
	if strings.ContainsRune(name, os.PathSeparator) {
		return name
	}
	if resolved, ok := findExecutableInPath(name, buildTerminalPath()); ok {
		return resolved
	}
	return name
}

func findExecutableInPath(name string, searchPath string) (string, bool) {
	for _, dir := range strings.Split(searchPath, string(os.PathListSeparator)) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			continue
		}
		candidate := filepath.Join(dir, name)
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() || info.Mode().Perm()&0111 == 0 {
			continue
		}
		return candidate, true
	}
	return "", false
}

func BuildCommandSpec(target Target, kubeconfigPath string, debugPodName string) (CommandSpec, error) {
	switch target.Kind {
	case TargetKindCluster:
		shellPath := strings.TrimSpace(os.Getenv("SHELL"))
		if shellPath == "" {
			shellPath = "sh"
		}

		return CommandSpec{
			Command: resolveExecutable(shellPath),
			Args:    []string{"-i"},
			Env:     buildTerminalEnv(kubeconfigPath),
			Dir:     userHomeDir(),
		}, nil
	case TargetKindPod:
		if strings.TrimSpace(target.Namespace) == "" {
			return CommandSpec{}, fmt.Errorf("namespace is required for pod terminal")
		}
		if strings.TrimSpace(target.PodName) == "" {
			return CommandSpec{}, fmt.Errorf("pod name is required for pod terminal")
		}

		args := []string{
			"--kubeconfig", kubeconfigPath,
			"exec", "-it",
			target.PodName,
			"-n", target.Namespace,
		}
		if strings.TrimSpace(target.Container) != "" {
			args = append(args, "-c", target.Container)
		}
		args = append(args, "--", "sh", "-lc", buildInteractiveShellBootstrap())

		return CommandSpec{
			Command: resolveExecutable("kubectl"),
			Args:    args,
			Env:     buildTerminalEnv(kubeconfigPath),
		}, nil
	case TargetKindNode:
		if strings.TrimSpace(debugPodName) == "" {
			return CommandSpec{}, fmt.Errorf("debug pod name is required for node terminal")
		}

		return CommandSpec{
			Command: resolveExecutable("kubectl"),
			Args: []string{
				"--kubeconfig", kubeconfigPath,
				"exec", "-it",
				debugPodName,
				"-n", "default",
				"--",
				"nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--", "sh", "-lc", buildInteractiveShellBootstrap(),
			},
			Env: buildTerminalEnv(kubeconfigPath),
		}, nil
	default:
		return CommandSpec{}, fmt.Errorf("unsupported terminal target kind %q", target.Kind)
	}
}

func userHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "."
	}
	return filepath.Clean(home)
}
