package main

import "testing"

func TestNormalizePortForwardKind(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input       string
		wantKind    string
		wantArgKind string
	}{
		{input: "pod", wantKind: "pod", wantArgKind: "pod"},
		{input: "pods", wantKind: "pod", wantArgKind: "pod"},
		{input: "svc", wantKind: "service", wantArgKind: "svc"},
		{input: "service", wantKind: "service", wantArgKind: "svc"},
		{input: "deployment", wantKind: "deployment", wantArgKind: "deployment"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			gotKind, gotArgKind, err := normalizePortForwardKind(tt.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if gotKind != tt.wantKind || gotArgKind != tt.wantArgKind {
				t.Fatalf("normalizePortForwardKind(%q) = (%q, %q), want (%q, %q)", tt.input, gotKind, gotArgKind, tt.wantKind, tt.wantArgKind)
			}
		})
	}
}

func TestNormalizePortForwardKindRejectsUnsupportedKind(t *testing.T) {
	t.Parallel()

	if _, _, err := normalizePortForwardKind("configmap"); err == nil {
		t.Fatal("expected unsupported kind error")
	}
}

func TestValidatePortForwardPort(t *testing.T) {
	t.Parallel()

	for _, port := range []int{1, 80, 65535} {
		if err := validatePortForwardPort("test", port); err != nil {
			t.Fatalf("expected port %d to be valid: %v", port, err)
		}
	}

	for _, port := range []int{0, -1, 65536} {
		if err := validatePortForwardPort("test", port); err == nil {
			t.Fatalf("expected port %d to be invalid", port)
		}
	}
}
