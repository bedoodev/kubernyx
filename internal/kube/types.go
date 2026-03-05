package kube

type NodeInfo struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Ready  bool   `json:"ready"`
	CPUCap int64  `json:"cpuCap"`
	MemCap int64  `json:"memCap"`
	PodCap int64  `json:"podCap"`
}

type NodeSummary struct {
	Total    int `json:"total"`
	Ready    int `json:"ready"`
	NotReady int `json:"notReady"`
	Masters  int `json:"masters"`
	Workers  int `json:"workers"`
}

type ResourceMetrics struct {
	CPUUsage       int64 `json:"cpuUsage"`
	CPURequests    int64 `json:"cpuRequests"`
	CPULimits      int64 `json:"cpuLimits"`
	CPUAllocatable int64 `json:"cpuAllocatable"`
	MemUsage       int64 `json:"memUsage"`
	MemRequests    int64 `json:"memRequests"`
	MemLimits      int64 `json:"memLimits"`
	MemAllocatable int64 `json:"memAllocatable"`
	PodCapacity    int64 `json:"podCapacity"`
	PodUsage       int64 `json:"podUsage"`
	MetricsAvail   bool  `json:"metricsAvailable"`
}

type WorkloadPhaseCounts struct {
	Running   int `json:"running"`
	Pending   int `json:"pending"`
	Failed    int `json:"failed"`
	Succeeded int `json:"succeeded"`
}

type WorkloadStatuses struct {
	Pods         WorkloadPhaseCounts `json:"pods"`
	Deployments  WorkloadPhaseCounts `json:"deployments"`
	ReplicaSets  WorkloadPhaseCounts `json:"replicaSets"`
	StatefulSets WorkloadPhaseCounts `json:"statefulSets"`
	DaemonSets   WorkloadPhaseCounts `json:"daemonSets"`
	Jobs         WorkloadPhaseCounts `json:"jobs"`
	CronJobs     WorkloadPhaseCounts `json:"cronJobs"`
}

type WorkloadCounts struct {
	Pods         int              `json:"pods"`
	PodRunning   int              `json:"podRunning"`
	PodPending   int              `json:"podPending"`
	PodFailed    int              `json:"podFailed"`
	PodSucceeded int              `json:"podSucceeded"`
	Deployments  int              `json:"deployments"`
	ReplicaSets  int              `json:"replicaSets"`
	StatefulSets int              `json:"statefulSets"`
	DaemonSets   int              `json:"daemonSets"`
	Jobs         int              `json:"jobs"`
	CronJobs     int              `json:"cronJobs"`
	Statuses     WorkloadStatuses `json:"statuses"`
}

type PodResource struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	CPU           string            `json:"cpu"`
	Memory        string            `json:"memory"`
	ControlledBy  string            `json:"controlledBy"`
	Status        string            `json:"status"`
	CreatedAtUnix int64             `json:"createdAtUnix"`
	Age           string            `json:"age"`
	Labels        map[string]string `json:"labels"`
	Annotations   map[string]string `json:"annotations"`
}

type DeploymentResource struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Pods          string            `json:"pods"`
	Replicas      int32             `json:"replicas"`
	Desired       int32             `json:"desired"`
	Current       int32             `json:"current"`
	Ready         int32             `json:"ready"`
	UpToDate      int32             `json:"upToDate"`
	Available     int32             `json:"available"`
	NodeSelector  string            `json:"nodeSelector"`
	Completions   string            `json:"completions"`
	Conditions    string            `json:"conditions"`
	Schedule      string            `json:"schedule"`
	Suspend       string            `json:"suspend"`
	Active        int32             `json:"active"`
	Last          string            `json:"last"`
	Next          string            `json:"next"`
	Status        string            `json:"status"`
	CreatedAtUnix int64             `json:"createdAtUnix"`
	Age           string            `json:"age"`
	Labels        map[string]string `json:"labels"`
	Annotations   map[string]string `json:"annotations"`
}

type PodResourceSnapshot struct {
	Items            []PodResource `json:"items"`
	MetricsAvailable bool          `json:"metricsAvailable"`
}

type DeploymentDetailRevision struct {
	Revision   string `json:"revision"`
	ReplicaSet string `json:"replicaSet"`
	Replicas   int32  `json:"replicas"`
	Ready      int32  `json:"ready"`
	Age        string `json:"age"`
}

type DeploymentDetailPod struct {
	Name      string `json:"name"`
	Node      string `json:"node"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	CPU       string `json:"cpu"`
	Memory    string `json:"memory"`
	Status    string `json:"status"`
}

type DeploymentDetail struct {
	Name            string                     `json:"name"`
	Namespace       string                     `json:"namespace"`
	Status          string                     `json:"status"`
	Replicas        int32                      `json:"replicas"`
	Current         int32                      `json:"current"`
	Ready           int32                      `json:"ready"`
	Updated         int32                      `json:"updated"`
	Available       int32                      `json:"available"`
	Unavailable     int32                      `json:"unavailable"`
	Completions     string                     `json:"completions"`
	Schedule        string                     `json:"schedule"`
	Suspend         bool                       `json:"suspend"`
	Active          int32                      `json:"active"`
	LastSchedule    string                     `json:"lastSchedule"`
	NextSchedule    string                     `json:"nextSchedule"`
	Age             string                     `json:"age"`
	Created         string                     `json:"created"`
	UID             string                     `json:"uid"`
	ResourceVersion string                     `json:"resourceVersion"`
	Labels          map[string]string          `json:"labels"`
	Annotations     map[string]string          `json:"annotations"`
	Selector        map[string]string          `json:"selector"`
	NodeSelector    map[string]string          `json:"nodeSelector"`
	StrategyType    string                     `json:"strategyType"`
	Conditions      []PodDetailCondition       `json:"conditions"`
	Tolerations     []string                   `json:"tolerations"`
	NodeAffinities  []string                   `json:"nodeAffinities"`
	PodAntiAffinity []string                   `json:"podAntiAffinities"`
	Containers      []PodDetailContainer       `json:"containers"`
	Revisions       []DeploymentDetailRevision `json:"revisions"`
	Pods            []DeploymentDetailPod      `json:"pods"`
	Events          []PodDetailEvent           `json:"events"`
	Manifest        string                     `json:"manifest"`
	ScaleSupported  bool                       `json:"scaleSupported"`
}

type DeploymentLogLine struct {
	PodName       string `json:"podName"`
	Container     string `json:"container"`
	CreatedAt     string `json:"createdAt"`
	CreatedAtUnix int64  `json:"createdAtUnix"`
	Message       string `json:"message"`
}

type PodDetailContainer struct {
	Name            string                  `json:"name"`
	Image           string                  `json:"image"`
	ImagePullPolicy string                  `json:"imagePullPolicy"`
	ContainerID     string                  `json:"containerId"`
	State           string                  `json:"state"`
	Ready           bool                    `json:"ready"`
	Restarts        int64                   `json:"restarts"`
	Command         []string                `json:"command"`
	Args            []string                `json:"args"`
	Env             []PodDetailEnvVar       `json:"env"`
	Mounts          []PodDetailVolumeMount  `json:"mounts"`
	Ports           []PodDetailPort         `json:"ports"`
	Requests        PodDetailResourceValues `json:"requests"`
	Limits          PodDetailResourceValues `json:"limits"`
}

type PodDetailEnvVar struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type PodDetailVolumeMount struct {
	Name      string `json:"name"`
	MountPath string `json:"mountPath"`
	ReadOnly  bool   `json:"readOnly"`
	SubPath   string `json:"subPath"`
}

type PodDetailPort struct {
	Name          string `json:"name"`
	ContainerPort int32  `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

type PodDetailResourceValues struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}

type PodDetailEvent struct {
	Type    string `json:"type"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Count   int32  `json:"count"`
	Age     string `json:"age"`
}

type PodDetailCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type PodDetailOwnerReference struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	UID        string `json:"uid"`
	Controller bool   `json:"controller"`
}

type PodDetailVolume struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Details string `json:"details"`
}

type PodDetail struct {
	Name             string                    `json:"name"`
	Namespace        string                    `json:"namespace"`
	Status           string                    `json:"status"`
	Phase            string                    `json:"phase"`
	Age              string                    `json:"age"`
	CPUUsage         string                    `json:"cpuUsage"`
	MemoryUsage      string                    `json:"memoryUsage"`
	CPUUsageMilli    int64                     `json:"cpuUsageMilli"`
	MemoryUsageBytes int64                     `json:"memoryUsageBytes"`
	CPURequests      int64                     `json:"cpuRequestsMilli"`
	CPULimits        int64                     `json:"cpuLimitsMilli"`
	MemoryRequests   int64                     `json:"memoryRequestsBytes"`
	MemoryLimits     int64                     `json:"memoryLimitsBytes"`
	MetricsAvail     bool                      `json:"metricsAvailable"`
	PodIP            string                    `json:"podIP"`
	Node             string                    `json:"node"`
	QOSClass         string                    `json:"qosClass"`
	RestartCount     int64                     `json:"restartCount"`
	ControlledBy     string                    `json:"controlledBy"`
	Created          string                    `json:"created"`
	UID              string                    `json:"uid"`
	ResourceVersion  string                    `json:"resourceVersion"`
	Labels           map[string]string         `json:"labels"`
	Annotations      map[string]string         `json:"annotations"`
	OwnerReferences  []PodDetailOwnerReference `json:"ownerReferences"`
	Volumes          []PodDetailVolume         `json:"volumes"`
	InitContainers   []PodDetailContainer      `json:"initContainers"`
	Containers       []PodDetailContainer      `json:"containers"`
	Conditions       []PodDetailCondition      `json:"conditions"`
	Events           []PodDetailEvent          `json:"events"`
	Manifest         string                    `json:"manifest"`
}

type PodLogLine struct {
	Container     string `json:"container"`
	CreatedAt     string `json:"createdAt"`
	CreatedAtUnix int64  `json:"createdAtUnix"`
	Message       string `json:"message"`
}

type PodExecResult struct {
	Container string `json:"container"`
	Command   string `json:"command"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	ExitCode  int    `json:"exitCode"`
}

const (
	workloadPhaseRunning   = "running"
	workloadPhasePending   = "pending"
	workloadPhaseFailed    = "failed"
	workloadPhaseSucceeded = "succeeded"
)

type ClusterOverview struct {
	NodeSummary NodeSummary     `json:"nodeSummary"`
	Resources   ResourceMetrics `json:"resources"`
	Namespaces  []string        `json:"namespaces"`
}
