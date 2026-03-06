export namespace cluster {
	
	export class ClusterInfo {
	    name: string;
	    filename: string;
	    healthStatus: string;
	
	    static createFrom(source: any = {}) {
	        return new ClusterInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.filename = source["filename"];
	        this.healthStatus = source["healthStatus"];
	    }
	}

}

export namespace kube {
	
	export class ClusterEvent {
	    type: string;
	    reason: string;
	    objectKind: string;
	    objectName: string;
	    namespace: string;
	    message: string;
	    count: number;
	    age: string;
	    createdAtUnix: number;
	
	    static createFrom(source: any = {}) {
	        return new ClusterEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.reason = source["reason"];
	        this.objectKind = source["objectKind"];
	        this.objectName = source["objectName"];
	        this.namespace = source["namespace"];
	        this.message = source["message"];
	        this.count = source["count"];
	        this.age = source["age"];
	        this.createdAtUnix = source["createdAtUnix"];
	    }
	}
	export class ResourceMetrics {
	    cpuUsage: number;
	    cpuRequests: number;
	    cpuLimits: number;
	    cpuAllocatable: number;
	    memUsage: number;
	    memRequests: number;
	    memLimits: number;
	    memAllocatable: number;
	    podCapacity: number;
	    podUsage: number;
	    metricsAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ResourceMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpuUsage = source["cpuUsage"];
	        this.cpuRequests = source["cpuRequests"];
	        this.cpuLimits = source["cpuLimits"];
	        this.cpuAllocatable = source["cpuAllocatable"];
	        this.memUsage = source["memUsage"];
	        this.memRequests = source["memRequests"];
	        this.memLimits = source["memLimits"];
	        this.memAllocatable = source["memAllocatable"];
	        this.podCapacity = source["podCapacity"];
	        this.podUsage = source["podUsage"];
	        this.metricsAvailable = source["metricsAvailable"];
	    }
	}
	export class NodeSummary {
	    total: number;
	    ready: number;
	    notReady: number;
	    masters: number;
	    workers: number;
	
	    static createFrom(source: any = {}) {
	        return new NodeSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.ready = source["ready"];
	        this.notReady = source["notReady"];
	        this.masters = source["masters"];
	        this.workers = source["workers"];
	    }
	}
	export class ClusterOverview {
	    nodeSummary: NodeSummary;
	    resources: ResourceMetrics;
	    namespaces: string[];
	
	    static createFrom(source: any = {}) {
	        return new ClusterOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeSummary = this.convertValues(source["nodeSummary"], NodeSummary);
	        this.resources = this.convertValues(source["resources"], ResourceMetrics);
	        this.namespaces = source["namespaces"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PodDetailEvent {
	    type: string;
	    reason: string;
	    message: string;
	    count: number;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.reason = source["reason"];
	        this.message = source["message"];
	        this.count = source["count"];
	        this.age = source["age"];
	    }
	}
	export class DeploymentDetailPod {
	    name: string;
	    node: string;
	    namespace: string;
	    ready: string;
	    cpu: string;
	    memory: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentDetailPod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.node = source["node"];
	        this.namespace = source["namespace"];
	        this.ready = source["ready"];
	        this.cpu = source["cpu"];
	        this.memory = source["memory"];
	        this.status = source["status"];
	    }
	}
	export class DeploymentDetailRevision {
	    revision: string;
	    replicaSet: string;
	    replicas: number;
	    ready: number;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentDetailRevision(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.revision = source["revision"];
	        this.replicaSet = source["replicaSet"];
	        this.replicas = source["replicas"];
	        this.ready = source["ready"];
	        this.age = source["age"];
	    }
	}
	export class PodDetailResourceValues {
	    cpu: string;
	    memory: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailResourceValues(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpu = source["cpu"];
	        this.memory = source["memory"];
	    }
	}
	export class PodDetailPort {
	    name: string;
	    containerPort: number;
	    protocol: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.containerPort = source["containerPort"];
	        this.protocol = source["protocol"];
	    }
	}
	export class PodDetailVolumeMount {
	    name: string;
	    mountPath: string;
	    readOnly: boolean;
	    subPath: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailVolumeMount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.mountPath = source["mountPath"];
	        this.readOnly = source["readOnly"];
	        this.subPath = source["subPath"];
	    }
	}
	export class PodDetailEnvVar {
	    name: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailEnvVar(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	    }
	}
	export class PodDetailContainer {
	    name: string;
	    image: string;
	    imagePullPolicy: string;
	    containerId: string;
	    state: string;
	    ready: boolean;
	    restarts: number;
	    command: string[];
	    args: string[];
	    env: PodDetailEnvVar[];
	    mounts: PodDetailVolumeMount[];
	    ports: PodDetailPort[];
	    requests: PodDetailResourceValues;
	    limits: PodDetailResourceValues;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailContainer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.image = source["image"];
	        this.imagePullPolicy = source["imagePullPolicy"];
	        this.containerId = source["containerId"];
	        this.state = source["state"];
	        this.ready = source["ready"];
	        this.restarts = source["restarts"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = this.convertValues(source["env"], PodDetailEnvVar);
	        this.mounts = this.convertValues(source["mounts"], PodDetailVolumeMount);
	        this.ports = this.convertValues(source["ports"], PodDetailPort);
	        this.requests = this.convertValues(source["requests"], PodDetailResourceValues);
	        this.limits = this.convertValues(source["limits"], PodDetailResourceValues);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PodDetailCondition {
	    type: string;
	    status: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailCondition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.status = source["status"];
	        this.message = source["message"];
	    }
	}
	export class DeploymentDetail {
	    name: string;
	    namespace: string;
	    status: string;
	    replicas: number;
	    current: number;
	    ready: number;
	    updated: number;
	    available: number;
	    unavailable: number;
	    completions: string;
	    schedule: string;
	    suspend: boolean;
	    active: number;
	    lastSchedule: string;
	    nextSchedule: string;
	    age: string;
	    created: string;
	    uid: string;
	    resourceVersion: string;
	    labels: Record<string, string>;
	    annotations: Record<string, string>;
	    selector: Record<string, string>;
	    nodeSelector: Record<string, string>;
	    strategyType: string;
	    conditions: PodDetailCondition[];
	    tolerations: string[];
	    nodeAffinities: string[];
	    podAntiAffinities: string[];
	    containers: PodDetailContainer[];
	    revisions: DeploymentDetailRevision[];
	    pods: DeploymentDetailPod[];
	    events: PodDetailEvent[];
	    manifest: string;
	    scaleSupported: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.replicas = source["replicas"];
	        this.current = source["current"];
	        this.ready = source["ready"];
	        this.updated = source["updated"];
	        this.available = source["available"];
	        this.unavailable = source["unavailable"];
	        this.completions = source["completions"];
	        this.schedule = source["schedule"];
	        this.suspend = source["suspend"];
	        this.active = source["active"];
	        this.lastSchedule = source["lastSchedule"];
	        this.nextSchedule = source["nextSchedule"];
	        this.age = source["age"];
	        this.created = source["created"];
	        this.uid = source["uid"];
	        this.resourceVersion = source["resourceVersion"];
	        this.labels = source["labels"];
	        this.annotations = source["annotations"];
	        this.selector = source["selector"];
	        this.nodeSelector = source["nodeSelector"];
	        this.strategyType = source["strategyType"];
	        this.conditions = this.convertValues(source["conditions"], PodDetailCondition);
	        this.tolerations = source["tolerations"];
	        this.nodeAffinities = source["nodeAffinities"];
	        this.podAntiAffinities = source["podAntiAffinities"];
	        this.containers = this.convertValues(source["containers"], PodDetailContainer);
	        this.revisions = this.convertValues(source["revisions"], DeploymentDetailRevision);
	        this.pods = this.convertValues(source["pods"], DeploymentDetailPod);
	        this.events = this.convertValues(source["events"], PodDetailEvent);
	        this.manifest = source["manifest"];
	        this.scaleSupported = source["scaleSupported"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class DeploymentLogLine {
	    podName: string;
	    container: string;
	    createdAt: string;
	    createdAtUnix: number;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentLogLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.podName = source["podName"];
	        this.container = source["container"];
	        this.createdAt = source["createdAt"];
	        this.createdAtUnix = source["createdAtUnix"];
	        this.message = source["message"];
	    }
	}
	export class DeploymentResource {
	    name: string;
	    namespace: string;
	    pods: string;
	    replicas: number;
	    desired: number;
	    current: number;
	    ready: number;
	    upToDate: number;
	    available: number;
	    nodeSelector: string;
	    completions: string;
	    conditions: string;
	    schedule: string;
	    suspend: string;
	    active: number;
	    last: string;
	    next: string;
	    status: string;
	    createdAtUnix: number;
	    age: string;
	    labels: Record<string, string>;
	    annotations: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.pods = source["pods"];
	        this.replicas = source["replicas"];
	        this.desired = source["desired"];
	        this.current = source["current"];
	        this.ready = source["ready"];
	        this.upToDate = source["upToDate"];
	        this.available = source["available"];
	        this.nodeSelector = source["nodeSelector"];
	        this.completions = source["completions"];
	        this.conditions = source["conditions"];
	        this.schedule = source["schedule"];
	        this.suspend = source["suspend"];
	        this.active = source["active"];
	        this.last = source["last"];
	        this.next = source["next"];
	        this.status = source["status"];
	        this.createdAtUnix = source["createdAtUnix"];
	        this.age = source["age"];
	        this.labels = source["labels"];
	        this.annotations = source["annotations"];
	    }
	}
	export class NodeAddress {
	    type: string;
	    address: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeAddress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.address = source["address"];
	    }
	}
	export class NodeConditionInfo {
	    type: string;
	    status: string;
	    reason: string;
	    message: string;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeConditionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.status = source["status"];
	        this.reason = source["reason"];
	        this.message = source["message"];
	        this.age = source["age"];
	    }
	}
	export class NodeTaint {
	    key: string;
	    value: string;
	    effect: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeTaint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.effect = source["effect"];
	    }
	}
	export class NodeDetail {
	    name: string;
	    role: string;
	    status: string;
	    version: string;
	    kernelVersion: string;
	    os: string;
	    architecture: string;
	    containerRuntime: string;
	    cpu: string;
	    memory: string;
	    pods: string;
	    cpuAllocatable: string;
	    memAllocatable: string;
	    podAllocatable: string;
	    age: string;
	    created: string;
	    uid: string;
	    labels: Record<string, string>;
	    annotations: Record<string, string>;
	    conditions: NodeConditionInfo[];
	    taints: NodeTaint[];
	    addresses: NodeAddress[];
	    events: PodDetailEvent[];
	    manifest: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.role = source["role"];
	        this.status = source["status"];
	        this.version = source["version"];
	        this.kernelVersion = source["kernelVersion"];
	        this.os = source["os"];
	        this.architecture = source["architecture"];
	        this.containerRuntime = source["containerRuntime"];
	        this.cpu = source["cpu"];
	        this.memory = source["memory"];
	        this.pods = source["pods"];
	        this.cpuAllocatable = source["cpuAllocatable"];
	        this.memAllocatable = source["memAllocatable"];
	        this.podAllocatable = source["podAllocatable"];
	        this.age = source["age"];
	        this.created = source["created"];
	        this.uid = source["uid"];
	        this.labels = source["labels"];
	        this.annotations = source["annotations"];
	        this.conditions = this.convertValues(source["conditions"], NodeConditionInfo);
	        this.taints = this.convertValues(source["taints"], NodeTaint);
	        this.addresses = this.convertValues(source["addresses"], NodeAddress);
	        this.events = this.convertValues(source["events"], PodDetailEvent);
	        this.manifest = source["manifest"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NodeResource {
	    name: string;
	    role: string;
	    status: string;
	    version: string;
	    cpu: string;
	    memory: string;
	    pods: string;
	    createdAtUnix: number;
	    age: string;
	    labels: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new NodeResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.role = source["role"];
	        this.status = source["status"];
	        this.version = source["version"];
	        this.cpu = source["cpu"];
	        this.memory = source["memory"];
	        this.pods = source["pods"];
	        this.createdAtUnix = source["createdAtUnix"];
	        this.age = source["age"];
	        this.labels = source["labels"];
	    }
	}
	
	
	export class PodDetailVolume {
	    name: string;
	    type: string;
	    details: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailVolume(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.details = source["details"];
	    }
	}
	export class PodDetailOwnerReference {
	    kind: string;
	    name: string;
	    uid: string;
	    controller: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailOwnerReference(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.uid = source["uid"];
	        this.controller = source["controller"];
	    }
	}
	export class PodDetail {
	    name: string;
	    namespace: string;
	    status: string;
	    phase: string;
	    age: string;
	    cpuUsage: string;
	    memoryUsage: string;
	    cpuUsageMilli: number;
	    memoryUsageBytes: number;
	    cpuRequestsMilli: number;
	    cpuLimitsMilli: number;
	    memoryRequestsBytes: number;
	    memoryLimitsBytes: number;
	    metricsAvailable: boolean;
	    podIP: string;
	    node: string;
	    qosClass: string;
	    restartCount: number;
	    controlledBy: string;
	    created: string;
	    uid: string;
	    resourceVersion: string;
	    labels: Record<string, string>;
	    annotations: Record<string, string>;
	    ownerReferences: PodDetailOwnerReference[];
	    volumes: PodDetailVolume[];
	    initContainers: PodDetailContainer[];
	    containers: PodDetailContainer[];
	    conditions: PodDetailCondition[];
	    events: PodDetailEvent[];
	    manifest: string;
	
	    static createFrom(source: any = {}) {
	        return new PodDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.phase = source["phase"];
	        this.age = source["age"];
	        this.cpuUsage = source["cpuUsage"];
	        this.memoryUsage = source["memoryUsage"];
	        this.cpuUsageMilli = source["cpuUsageMilli"];
	        this.memoryUsageBytes = source["memoryUsageBytes"];
	        this.cpuRequestsMilli = source["cpuRequestsMilli"];
	        this.cpuLimitsMilli = source["cpuLimitsMilli"];
	        this.memoryRequestsBytes = source["memoryRequestsBytes"];
	        this.memoryLimitsBytes = source["memoryLimitsBytes"];
	        this.metricsAvailable = source["metricsAvailable"];
	        this.podIP = source["podIP"];
	        this.node = source["node"];
	        this.qosClass = source["qosClass"];
	        this.restartCount = source["restartCount"];
	        this.controlledBy = source["controlledBy"];
	        this.created = source["created"];
	        this.uid = source["uid"];
	        this.resourceVersion = source["resourceVersion"];
	        this.labels = source["labels"];
	        this.annotations = source["annotations"];
	        this.ownerReferences = this.convertValues(source["ownerReferences"], PodDetailOwnerReference);
	        this.volumes = this.convertValues(source["volumes"], PodDetailVolume);
	        this.initContainers = this.convertValues(source["initContainers"], PodDetailContainer);
	        this.containers = this.convertValues(source["containers"], PodDetailContainer);
	        this.conditions = this.convertValues(source["conditions"], PodDetailCondition);
	        this.events = this.convertValues(source["events"], PodDetailEvent);
	        this.manifest = source["manifest"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	export class PodExecResult {
	    container: string;
	    command: string;
	    stdout: string;
	    stderr: string;
	    exitCode: number;
	
	    static createFrom(source: any = {}) {
	        return new PodExecResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.container = source["container"];
	        this.command = source["command"];
	        this.stdout = source["stdout"];
	        this.stderr = source["stderr"];
	        this.exitCode = source["exitCode"];
	    }
	}
	export class PodLogLine {
	    container: string;
	    createdAt: string;
	    createdAtUnix: number;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new PodLogLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.container = source["container"];
	        this.createdAt = source["createdAt"];
	        this.createdAtUnix = source["createdAtUnix"];
	        this.message = source["message"];
	    }
	}
	
	export class WorkloadPhaseCounts {
	    running: number;
	    pending: number;
	    failed: number;
	    succeeded: number;
	
	    static createFrom(source: any = {}) {
	        return new WorkloadPhaseCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.pending = source["pending"];
	        this.failed = source["failed"];
	        this.succeeded = source["succeeded"];
	    }
	}
	export class WorkloadStatuses {
	    pods: WorkloadPhaseCounts;
	    deployments: WorkloadPhaseCounts;
	    replicaSets: WorkloadPhaseCounts;
	    statefulSets: WorkloadPhaseCounts;
	    daemonSets: WorkloadPhaseCounts;
	    jobs: WorkloadPhaseCounts;
	    cronJobs: WorkloadPhaseCounts;
	
	    static createFrom(source: any = {}) {
	        return new WorkloadStatuses(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pods = this.convertValues(source["pods"], WorkloadPhaseCounts);
	        this.deployments = this.convertValues(source["deployments"], WorkloadPhaseCounts);
	        this.replicaSets = this.convertValues(source["replicaSets"], WorkloadPhaseCounts);
	        this.statefulSets = this.convertValues(source["statefulSets"], WorkloadPhaseCounts);
	        this.daemonSets = this.convertValues(source["daemonSets"], WorkloadPhaseCounts);
	        this.jobs = this.convertValues(source["jobs"], WorkloadPhaseCounts);
	        this.cronJobs = this.convertValues(source["cronJobs"], WorkloadPhaseCounts);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkloadCounts {
	    pods: number;
	    podRunning: number;
	    podPending: number;
	    podFailed: number;
	    podSucceeded: number;
	    deployments: number;
	    replicaSets: number;
	    statefulSets: number;
	    daemonSets: number;
	    jobs: number;
	    cronJobs: number;
	    statuses: WorkloadStatuses;
	
	    static createFrom(source: any = {}) {
	        return new WorkloadCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pods = source["pods"];
	        this.podRunning = source["podRunning"];
	        this.podPending = source["podPending"];
	        this.podFailed = source["podFailed"];
	        this.podSucceeded = source["podSucceeded"];
	        this.deployments = source["deployments"];
	        this.replicaSets = source["replicaSets"];
	        this.statefulSets = source["statefulSets"];
	        this.daemonSets = source["daemonSets"];
	        this.jobs = source["jobs"];
	        this.cronJobs = source["cronJobs"];
	        this.statuses = this.convertValues(source["statuses"], WorkloadStatuses);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

