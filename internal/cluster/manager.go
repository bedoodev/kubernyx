package cluster

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type ClusterInfo struct {
	Name         string `json:"name"`
	Filename     string `json:"filename"`
	HealthStatus string `json:"healthStatus"`
}

func ListClusters(basePath string) ([]ClusterInfo, error) {
	if basePath == "" {
		return nil, fmt.Errorf("base path not configured")
	}
	info, err := os.Stat(basePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []ClusterInfo{}, nil
		}
		return nil, fmt.Errorf("failed to read path: %w", err)
	}

	if !info.IsDir() {
		filename := filepath.Base(basePath)
		if !isKubeconfig(filename) {
			return []ClusterInfo{}, nil
		}
		cluster := ClusterInfo{
			Name:         strings.TrimSuffix(strings.TrimSuffix(filename, filepath.Ext(filename)), "."),
			Filename:     filename,
			HealthStatus: checkClusterHealth(basePath),
		}
		return []ClusterInfo{cluster}, nil
	}

	entries, err := os.ReadDir(basePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}
	var clusters []ClusterInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if isKubeconfig(name) {
			clusters = append(clusters, ClusterInfo{
				Name:         strings.TrimSuffix(strings.TrimSuffix(name, filepath.Ext(name)), "."),
				Filename:     name,
				HealthStatus: HealthRed,
			})
		}
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, maxHealthcheckParallel)
	for i := range clusters {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			kubeconfigPath, err := safeJoin(basePath, clusters[idx].Filename)
			if err != nil {
				clusters[idx].HealthStatus = HealthRed
				return
			}

			clusters[idx].HealthStatus = checkClusterHealth(kubeconfigPath)
		}(i)
	}
	wg.Wait()

	return clusters, nil
}

func SaveCluster(basePath, name, content string) error {
	if basePath == "" {
		return fmt.Errorf("base path not configured")
	}
	targetDir := basePath
	if info, err := os.Stat(basePath); err == nil && !info.IsDir() {
		targetDir = filepath.Dir(basePath)
	}
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return err
	}
	filename := sanitizeFilename(name)
	if filename == "" {
		return fmt.Errorf("cluster name is invalid")
	}
	if !strings.HasSuffix(filename, ".yaml") && !strings.HasSuffix(filename, ".yml") && !strings.HasSuffix(filename, ".json") {
		filename += ".yaml"
	}
	p, err := safeJoin(targetDir, filename)
	if err != nil {
		return err
	}
	return os.WriteFile(p, []byte(content), 0600)
}

func RenameCluster(basePath, oldFilename, newName string) (string, error) {
	if basePath == "" {
		return "", fmt.Errorf("base path not configured")
	}
	oldPath, err := resolveClusterPath(basePath, oldFilename)
	if err != nil {
		return "", err
	}
	ext := filepath.Ext(oldFilename)
	sanitized := sanitizeFilename(newName)
	if sanitized == "" {
		return "", fmt.Errorf("cluster name is invalid")
	}
	newFilename := sanitized + ext
	newPath, err := resolveClusterPath(basePath, newFilename)
	if err != nil {
		return "", err
	}
	if oldPath == newPath {
		return newFilename, nil
	}
	if _, err := os.Stat(newPath); err == nil {
		return "", fmt.Errorf("a cluster with name %q already exists", newName)
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return "", err
	}
	return newFilename, nil
}

func DeleteCluster(basePath, filename string) error {
	if basePath == "" {
		return fmt.Errorf("base path not configured")
	}
	p, err := resolveClusterPath(basePath, filename)
	if err != nil {
		return err
	}
	return os.Remove(p)
}

func ReadClusterConfig(basePath, filename string) (string, error) {
	if basePath == "" {
		return "", fmt.Errorf("base path not configured")
	}
	p, err := resolveClusterPath(basePath, filename)
	if err != nil {
		return "", err
	}

	content, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func UpdateClusterConfig(basePath, filename, content string) error {
	if basePath == "" {
		return fmt.Errorf("base path not configured")
	}
	p, err := resolveClusterPath(basePath, filename)
	if err != nil {
		return err
	}
	return os.WriteFile(p, []byte(content), 0600)
}

func GetKubeconfigPath(basePath, filename string) (string, error) {
	if basePath == "" {
		return "", fmt.Errorf("base path not configured")
	}
	return resolveClusterPath(basePath, filename)
}

func resolveClusterPath(basePath, filename string) (string, error) {
	info, err := os.Stat(basePath)
	if err == nil && !info.IsDir() {
		baseFilename := filepath.Base(basePath)
		targetFilename := strings.TrimSpace(filename)
		if targetFilename == "" || targetFilename == baseFilename {
			return basePath, nil
		}
		return safeJoin(filepath.Dir(basePath), targetFilename)
	}
	if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("failed to read path: %w", err)
	}
	return safeJoin(basePath, filename)
}

func safeJoin(basePath, filename string) (string, error) {
	p := filepath.Join(basePath, filename)
	rel, err := filepath.Rel(basePath, p)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("invalid filename: path escapes base directory")
	}
	return p, nil
}

func isKubeconfig(name string) bool {
	lower := strings.ToLower(name)
	if lower == "config" {
		return true
	}
	return strings.HasSuffix(lower, ".yaml") ||
		strings.HasSuffix(lower, ".yml") ||
		strings.HasSuffix(lower, ".json") ||
		strings.HasSuffix(lower, ".conf") ||
		strings.HasSuffix(lower, ".kubeconfig")
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	name = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return '-'
		}
		return r
	}, name)
	return name
}
