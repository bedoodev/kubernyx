package terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFindExecutableInPath(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	executablePath := filepath.Join(dir, "kubectl")
	if err := os.WriteFile(executablePath, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatalf("write executable: %v", err)
	}

	resolved, ok := findExecutableInPath("kubectl", strings.Join([]string{t.TempDir(), dir}, string(os.PathListSeparator)))
	if !ok {
		t.Fatal("expected kubectl to resolve from search path")
	}
	if resolved != executablePath {
		t.Fatalf("expected %q, got %q", executablePath, resolved)
	}
}

func TestInteractiveShellArgsSkipsUserStartupFiles(t *testing.T) {
	t.Parallel()

	zshArgs := strings.Join(interactiveShellArgs("/bin/zsh"), " ")
	if zshArgs != "-f -i" {
		t.Fatalf("expected zsh to skip user startup files, got %q", zshArgs)
	}

	bashArgs := strings.Join(interactiveShellArgs("/bin/bash"), " ")
	if bashArgs != "--noprofile --norc -i" {
		t.Fatalf("expected bash to skip user startup files, got %q", bashArgs)
	}
}

func TestBuildCommandSpecForPod(t *testing.T) {
	t.Parallel()

	spec, err := BuildCommandSpec(Target{
		Kind:      TargetKindPod,
		Filename:  "demo",
		Namespace: "default",
		PodName:   "pod-a",
		Container: "main",
	}, "/tmp/demo-kubeconfig", "")
	if err != nil {
		t.Fatalf("build pod command spec: %v", err)
	}

	if filepath.Base(spec.Command) != "kubectl" {
		t.Fatalf("expected kubectl command, got %q", spec.Command)
	}

	joined := strings.Join(spec.Args, " ")
	for _, expected := range []string{
		"--kubeconfig /tmp/demo-kubeconfig",
		"exec -it pod-a -n default -c main -- sh -lc",
		"LS_COLORS=",
		"ls --color=never",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected %q in args %q", expected, joined)
		}
	}
}

func TestBuildCommandSpecForNode(t *testing.T) {
	t.Parallel()

	spec, err := BuildCommandSpec(Target{
		Kind:     TargetKindNode,
		Filename: "demo",
		NodeName: "node-a",
	}, "/tmp/demo-kubeconfig", "kubernyx-debug")
	if err != nil {
		t.Fatalf("build node command spec: %v", err)
	}

	joined := strings.Join(spec.Args, " ")
	if !strings.Contains(joined, "exec -it kubernyx-debug -n default -- nsenter -t 1 -m -u -i -n -p -- sh -lc") {
		t.Fatalf("unexpected node exec args: %q", joined)
	}
	if !strings.Contains(joined, "ls --color=never") {
		t.Fatalf("unexpected node exec args: %q", joined)
	}
}
