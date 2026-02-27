package kube

import (
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
)

func volumeTypeAndDetails(volume corev1.Volume) (string, string) {
	source := volume.VolumeSource
	switch {
	case source.Projected != nil:
		return "Projected", projectedVolumeDetails(source.Projected)
	case source.ConfigMap != nil:
		name := strings.TrimSpace(source.ConfigMap.Name)
		if name == "" {
			name = "-"
		}
		return "ConfigMap", "ConfigMap: " + name
	case source.Secret != nil:
		name := strings.TrimSpace(source.Secret.SecretName)
		if name == "" {
			name = "-"
		}
		return "Secret", "Secret: " + name
	case source.PersistentVolumeClaim != nil:
		name := strings.TrimSpace(source.PersistentVolumeClaim.ClaimName)
		if name == "" {
			name = "-"
		}
		return "PersistentVolumeClaim", "Claim: " + name
	case source.EmptyDir != nil:
		medium := string(source.EmptyDir.Medium)
		if strings.TrimSpace(medium) == "" {
			medium = "node"
		}
		return "EmptyDir", "Medium: " + medium
	case source.HostPath != nil:
		path := strings.TrimSpace(source.HostPath.Path)
		if path == "" {
			path = "-"
		}
		return "HostPath", "Path: " + path
	case source.NFS != nil:
		server := strings.TrimSpace(source.NFS.Server)
		path := strings.TrimSpace(source.NFS.Path)
		if server == "" {
			server = "-"
		}
		if path == "" {
			path = "-"
		}
		return "NFS", fmt.Sprintf("Server: %s, Path: %s", server, path)
	default:
		return "Unknown", "-"
	}
}

func projectedVolumeDetails(projected *corev1.ProjectedVolumeSource) string {
	if projected == nil || len(projected.Sources) == 0 {
		return "-"
	}

	parts := make([]string, 0, len(projected.Sources))
	for _, source := range projected.Sources {
		switch {
		case source.ServiceAccountToken != nil:
			tokenPath := strings.TrimSpace(source.ServiceAccountToken.Path)
			if tokenPath == "" {
				tokenPath = "token"
			}
			parts = append(parts, "ServiceAccountToken: "+tokenPath)
		case source.ConfigMap != nil:
			name := strings.TrimSpace(source.ConfigMap.Name)
			if name == "" {
				name = "-"
			}
			parts = append(parts, "ConfigMap: "+name)
		case source.DownwardAPI != nil:
			parts = append(parts, "DownwardAPI: -")
		case source.Secret != nil:
			name := strings.TrimSpace(source.Secret.Name)
			if name == "" {
				name = "-"
			}
			parts = append(parts, "Secret: "+name)
		}
	}

	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, ", ")
}
