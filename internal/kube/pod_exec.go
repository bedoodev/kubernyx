package kube

import (
	"bytes"
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

var execExitCodePattern = regexp.MustCompile(`exit code ([0-9]+)`)

func parseExecExitCode(err error) (int, bool) {
	if err == nil {
		return 0, true
	}
	matches := execExitCodePattern.FindStringSubmatch(err.Error())
	if len(matches) != 2 {
		return 0, false
	}
	code, convErr := strconv.Atoi(matches[1])
	if convErr != nil {
		return 0, false
	}
	return code, true
}

func (c *Client) ExecPodCommand(ctx context.Context, namespace string, podName string, container string, command string) (*PodExecResult, error) {
	namespace = strings.TrimSpace(namespace)
	podName = strings.TrimSpace(podName)
	container = strings.TrimSpace(container)
	command = strings.TrimSpace(command)

	if namespace == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if podName == "" {
		return nil, fmt.Errorf("pod name is required")
	}
	if command == "" {
		return nil, fmt.Errorf("command is required")
	}
	if c.config == nil {
		return nil, fmt.Errorf("client config is not available")
	}

	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod: %w", err)
	}

	targetContainer := container
	if targetContainer == "" {
		if len(pod.Spec.Containers) == 0 {
			return nil, fmt.Errorf("pod has no containers")
		}
		targetContainer = pod.Spec.Containers[0].Name
	}

	containerFound := false
	for _, candidate := range pod.Spec.Containers {
		if candidate.Name == targetContainer {
			containerFound = true
			break
		}
	}
	if !containerFound {
		return nil, fmt.Errorf("container %q not found in pod", targetContainer)
	}

	request := c.clientset.CoreV1().RESTClient().
		Post().
		Namespace(namespace).
		Resource("pods").
		Name(podName).
		SubResource("exec")
	request.VersionedParams(&corev1.PodExecOptions{
		Container: targetContainer,
		Command: []string{
			"sh",
			"-lc",
			command,
		},
		Stdin:  false,
		Stdout: true,
		Stderr: true,
		TTY:    false,
	}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(c.config, "POST", request.URL())
	if err != nil {
		return nil, fmt.Errorf("failed to initialize pod exec: %w", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	streamErr := executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  nil,
		Stdout: &stdout,
		Stderr: &stderr,
		Tty:    false,
	})

	exitCode := 0
	if streamErr != nil {
		if parsedCode, ok := parseExecExitCode(streamErr); ok {
			exitCode = parsedCode
			if strings.TrimSpace(stderr.String()) == "" {
				_, _ = stderr.WriteString(streamErr.Error())
			}
		} else {
			return nil, fmt.Errorf("failed to execute command: %w", streamErr)
		}
	}

	return &PodExecResult{
		Container: targetContainer,
		Command:   command,
		Stdout:    strings.TrimRight(stdout.String(), "\r\n"),
		Stderr:    strings.TrimRight(stderr.String(), "\r\n"),
		ExitCode:  exitCode,
	}, nil
}
