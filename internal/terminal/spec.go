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

func BuildCommandSpec(target Target, kubeconfigPath string, debugPodName string) (CommandSpec, error) {
	switch target.Kind {
	case TargetKindCluster:
		shellPath := strings.TrimSpace(os.Getenv("SHELL"))
		if shellPath == "" {
			shellPath = "sh"
		}

		return CommandSpec{
			Command: shellPath,
			Args:    []string{"-i"},
			Env: append(os.Environ(),
				fmt.Sprintf("KUBECONFIG=%s", kubeconfigPath),
				"TERM=xterm-256color",
			),
			Dir: userHomeDir(),
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
			Command: "kubectl",
			Args:    args,
			Env: append(os.Environ(),
				fmt.Sprintf("KUBECONFIG=%s", kubeconfigPath),
				"TERM=xterm-256color",
			),
		}, nil
	case TargetKindNode:
		if strings.TrimSpace(debugPodName) == "" {
			return CommandSpec{}, fmt.Errorf("debug pod name is required for node terminal")
		}

		return CommandSpec{
			Command: "kubectl",
			Args: []string{
				"--kubeconfig", kubeconfigPath,
				"exec", "-it",
				debugPodName,
				"-n", "default",
				"--",
				"nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--", "sh", "-lc", buildInteractiveShellBootstrap(),
			},
			Env: append(os.Environ(),
				fmt.Sprintf("KUBECONFIG=%s", kubeconfigPath),
				"TERM=xterm-256color",
			),
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
