import type { ClusterSection, ConfigTabId, NetworkTabId, WorkloadTabId } from '../../../shared/types'

type SidebarNavIconName = ClusterSection | WorkloadTabId | ConfigTabId | NetworkTabId

interface Props {
  name: SidebarNavIconName
}

export default function SidebarNavIcon({ name }: Props) {
  const commonProps = {
    className: 'sidebar-nav-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'overview':
      return <svg {...commonProps}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'nodes':
      return <svg {...commonProps}><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 10v4"/></svg>
    case 'events':
      return <svg {...commonProps}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
    case 'workloads':
      return <svg {...commonProps}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>
    case 'config':
      return <svg {...commonProps}><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
    case 'network':
      return <svg {...commonProps}><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="m7.3 10.8 9.4-4.6M7.3 13.2l9.4 4.6"/></svg>
    case 'pods':
      return <svg {...commonProps}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12.1V21"/></svg>
    case 'deployments':
      return <svg {...commonProps}><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M14 7h4a2 2 0 0 1 2 2v1M10 17H6a2 2 0 0 1-2-2v-1"/></svg>
    case 'daemon-sets':
      return <svg {...commonProps}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>
    case 'stateful-sets':
      return <svg {...commonProps}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>
    case 'jobs':
      return <svg {...commonProps}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></svg>
    case 'cronjobs':
      return <svg {...commonProps}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M7 2 4 5M17 2l3 3"/></svg>
    case 'config-maps':
      return <svg {...commonProps}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h6M9 16h6"/></svg>
    case 'secrets':
      return <svg {...commonProps}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
    case 'services':
      return <svg {...commonProps}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="m8 8 2.7 7M16 8l-2.7 7M9 6h6"/></svg>
    case 'ingress':
      return <svg {...commonProps}><path d="M4 20V9a5 5 0 0 1 5-5h11"/><path d="m16 1 4 3-4 3M9 20h6M12 17v3"/></svg>
    default:
      return null
  }
}
