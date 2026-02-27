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
	export class PodDetailContainer {
	    name: string;
	    image: string;
	    state: string;
	    ready: boolean;
	    restarts: number;
	
	    static createFrom(source: any = {}) {
	        return new PodDetailContainer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.image = source["image"];
	        this.state = source["state"];
	        this.ready = source["ready"];
	        this.restarts = source["restarts"];
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
	    containers: PodDetailContainer[];
	    conditions: PodDetailCondition[];
	
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
	        this.containers = this.convertValues(source["containers"], PodDetailContainer);
	        this.conditions = this.convertValues(source["conditions"], PodDetailCondition);
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

