package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type AppConfig struct {
	BasePath string `json:"basePath"`
}

func defaultBasePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".kube", "config")
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".kubernyx")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

func Load() (*AppConfig, error) {
	p, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &AppConfig{BasePath: defaultBasePath()}, nil
		}
		return nil, err
	}
	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return &AppConfig{BasePath: defaultBasePath()}, nil
	}
	if cfg.BasePath == "" {
		cfg.BasePath = defaultBasePath()
	}
	return &cfg, nil
}

func Save(cfg *AppConfig) error {
	p, err := configPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}
