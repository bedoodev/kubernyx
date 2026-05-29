package cluster

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsKubeconfigContent(t *testing.T) {
	t.Parallel()

	validYAML := []byte(`
apiVersion: v1
kind: Config
clusters:
  - name: demo
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: demo
    context:
      cluster: demo
      user: demo
users:
  - name: demo
    user:
      token: test
current-context: demo
`)

	validJSON := []byte(`{"apiVersion":"v1","kind":"Config","clusters":[{"name":"demo"}],"contexts":[{"name":"demo"}],"users":[{"name":"demo"}]}`)
	invalid := []byte(`apiVersion: v1
kind: Pod
metadata:
  name: nope
`)

	if !isKubeconfigContent(validYAML) {
		t.Fatalf("expected yaml kubeconfig content to validate")
	}
	if !isKubeconfigContent(validJSON) {
		t.Fatalf("expected json kubeconfig content to validate")
	}
	if isKubeconfigContent(invalid) {
		t.Fatalf("expected non-kubeconfig content to be rejected")
	}
}

func TestListClustersIncludesHiddenAndExtensionlessFiles(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	content := []byte(`
apiVersion: v1
kind: Config
clusters:
  - name: demo
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: demo
    context:
      cluster: demo
      user: demo
users:
  - name: demo
    user:
      token: test
current-context: demo
`)

	if err := os.WriteFile(filepath.Join(tempDir, ".hidden-cluster"), content, 0o600); err != nil {
		t.Fatalf("write hidden kubeconfig: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "extensionless"), content, 0o600); err != nil {
		t.Fatalf("write extensionless kubeconfig: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "notes.txt"), []byte("not kubeconfig"), 0o600); err != nil {
		t.Fatalf("write invalid file: %v", err)
	}

	clusters, err := ListClusters(tempDir)
	if err != nil {
		t.Fatalf("list clusters: %v", err)
	}

	found := map[string]bool{}
	for _, item := range clusters {
		found[item.Filename] = true
	}

	if !found[".hidden-cluster"] {
		t.Fatalf("expected hidden kubeconfig file to be discovered")
	}
	if !found["extensionless"] {
		t.Fatalf("expected extensionless kubeconfig file to be discovered")
	}
	if found["notes.txt"] {
		t.Fatalf("did not expect invalid file to be discovered")
	}
}
