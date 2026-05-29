package cluster

import (
	"encoding/json"
	"os"
	"strings"

	"sigs.k8s.io/yaml"
)

func isKubeconfigFile(path string) bool {
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return isKubeconfigContent(content)
}

func isKubeconfigContent(content []byte) bool {
	trimmed := strings.TrimSpace(string(content))
	if trimmed == "" {
		return false
	}

	var document map[string]any
	if json.Valid([]byte(trimmed)) {
		if err := json.Unmarshal([]byte(trimmed), &document); err != nil {
			return false
		}
	} else if err := yaml.Unmarshal([]byte(trimmed), &document); err != nil {
		return false
	}

	apiVersion, _ := document["apiVersion"].(string)
	kind, _ := document["kind"].(string)
	if apiVersion != "v1" || kind != "Config" {
		return false
	}

	for _, section := range []string{"clusters", "contexts", "users"} {
		value, ok := document[section]
		if !ok {
			continue
		}
		if list, ok := value.([]any); ok && len(list) > 0 {
			return true
		}
	}

	return false
}
