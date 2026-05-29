package kube

import (
	"errors"
	"testing"
)

func TestAggregateBatchDelete(t *testing.T) {
	t.Parallel()

	items := []ResourceRef{
		{Namespace: "default", Name: "ok-a"},
		{Namespace: "default", Name: "fail-b"},
		{Namespace: "kube-system", Name: "ok-c"},
	}

	result := aggregateBatchDelete(items, func(item ResourceRef) error {
		if item.Name == "fail-b" {
			return errors.New("boom")
		}
		return nil
	})

	if len(result.Deleted) != 2 {
		t.Fatalf("expected 2 deleted items, got %d", len(result.Deleted))
	}
	if len(result.Failed) != 1 {
		t.Fatalf("expected 1 failed item, got %d", len(result.Failed))
	}
	if result.Failed[0].Namespace != "default" || result.Failed[0].Name != "fail-b" {
		t.Fatalf("unexpected failed item: %+v", result.Failed[0])
	}
	if result.Failed[0].Error != "boom" {
		t.Fatalf("unexpected failure error: %s", result.Failed[0].Error)
	}
}
