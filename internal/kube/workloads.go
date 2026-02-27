package kube

import (
	"context"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (c *Client) GetWorkloads(ctx context.Context, namespaces []string) (*WorkloadCounts, error) {
	counts := &WorkloadCounts{}

	if len(namespaces) == 0 {
		namespaces = []string{""}
	}

	for _, ns := range namespaces {
		pods, err := c.clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.Pods += len(pods.Items)
			for _, pod := range pods.Items {
				switch pod.Status.Phase {
				case corev1.PodRunning:
					counts.PodRunning++
					addWorkloadPhase(&counts.Statuses.Pods, workloadPhaseRunning)
				case corev1.PodPending:
					counts.PodPending++
					addWorkloadPhase(&counts.Statuses.Pods, workloadPhasePending)
				case corev1.PodFailed:
					counts.PodFailed++
					addWorkloadPhase(&counts.Statuses.Pods, workloadPhaseFailed)
				case corev1.PodSucceeded:
					counts.PodSucceeded++
					addWorkloadPhase(&counts.Statuses.Pods, workloadPhaseSucceeded)
				default:
					counts.PodPending++
					addWorkloadPhase(&counts.Statuses.Pods, workloadPhasePending)
				}
			}
		}

		deps, err := c.clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.Deployments += len(deps.Items)
			for _, dep := range deps.Items {
				addWorkloadPhase(&counts.Statuses.Deployments, classifyDeployment(dep))
			}
		}

		rs, err := c.clientset.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.ReplicaSets += len(rs.Items)
			for _, replicaSet := range rs.Items {
				addWorkloadPhase(&counts.Statuses.ReplicaSets, classifyReplicaSet(replicaSet))
			}
		}

		ss, err := c.clientset.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.StatefulSets += len(ss.Items)
			for _, statefulSet := range ss.Items {
				addWorkloadPhase(&counts.Statuses.StatefulSets, classifyStatefulSet(statefulSet))
			}
		}

		ds, err := c.clientset.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.DaemonSets += len(ds.Items)
			for _, daemonSet := range ds.Items {
				addWorkloadPhase(&counts.Statuses.DaemonSets, classifyDaemonSet(daemonSet))
			}
		}

		jobs, err := c.clientset.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.Jobs += len(jobs.Items)
			for _, job := range jobs.Items {
				addWorkloadPhase(&counts.Statuses.Jobs, classifyJob(job))
			}
		}

		cj, err := c.clientset.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			counts.CronJobs += len(cj.Items)
			for _, cronJob := range cj.Items {
				addWorkloadPhase(&counts.Statuses.CronJobs, classifyCronJob(cronJob))
			}
		}
	}

	return counts, nil
}

func addWorkloadPhase(target *WorkloadPhaseCounts, phase string) {
	switch phase {
	case workloadPhaseRunning:
		target.Running++
	case workloadPhaseFailed:
		target.Failed++
	case workloadPhaseSucceeded:
		target.Succeeded++
	default:
		target.Pending++
	}
}

func classifyDeployment(dep appsv1.Deployment) string {
	for _, cond := range dep.Status.Conditions {
		if cond.Type == appsv1.DeploymentProgressing && cond.Status == corev1.ConditionFalse && cond.Reason == "ProgressDeadlineExceeded" {
			return workloadPhaseFailed
		}
	}
	desired := int32(1)
	if dep.Spec.Replicas != nil {
		desired = *dep.Spec.Replicas
	}
	if desired == 0 {
		return workloadPhaseSucceeded
	}
	if dep.Status.ReadyReplicas >= desired {
		return workloadPhaseRunning
	}
	return workloadPhasePending
}

func classifyReplicaSet(replicaSet appsv1.ReplicaSet) string {
	for _, cond := range replicaSet.Status.Conditions {
		if cond.Type == appsv1.ReplicaSetReplicaFailure && cond.Status == corev1.ConditionTrue {
			return workloadPhaseFailed
		}
	}
	desired := int32(1)
	if replicaSet.Spec.Replicas != nil {
		desired = *replicaSet.Spec.Replicas
	}
	if desired == 0 {
		return workloadPhaseSucceeded
	}
	if replicaSet.Status.ReadyReplicas >= desired {
		return workloadPhaseRunning
	}
	return workloadPhasePending
}

func classifyStatefulSet(statefulSet appsv1.StatefulSet) string {
	for _, cond := range statefulSet.Status.Conditions {
		if string(cond.Type) == "ReplicaFailure" && cond.Status == corev1.ConditionTrue {
			return workloadPhaseFailed
		}
	}
	desired := int32(1)
	if statefulSet.Spec.Replicas != nil {
		desired = *statefulSet.Spec.Replicas
	}
	if desired == 0 {
		return workloadPhaseSucceeded
	}
	if statefulSet.Status.ReadyReplicas >= desired {
		return workloadPhaseRunning
	}
	return workloadPhasePending
}

func classifyDaemonSet(daemonSet appsv1.DaemonSet) string {
	desired := daemonSet.Status.DesiredNumberScheduled
	if desired == 0 {
		return workloadPhaseSucceeded
	}
	if daemonSet.Status.NumberReady >= desired {
		return workloadPhaseRunning
	}
	if daemonSet.Status.NumberReady == 0 && daemonSet.Status.NumberUnavailable >= desired {
		return workloadPhaseFailed
	}
	return workloadPhasePending
}

func classifyJob(job batchv1.Job) string {
	if job.Status.Failed > 0 {
		return workloadPhaseFailed
	}
	if job.Status.Active > 0 {
		return workloadPhaseRunning
	}
	if job.Status.Succeeded > 0 {
		return workloadPhaseSucceeded
	}
	return workloadPhasePending
}

func classifyCronJob(cronJob batchv1.CronJob) string {
	if len(cronJob.Status.Active) > 0 {
		return workloadPhaseRunning
	}
	return workloadPhasePending
}
