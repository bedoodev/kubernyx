export type RbacTabId =
  | 'roles'
  | 'role-bindings'
  | 'cluster-roles'
  | 'cluster-role-bindings';

export interface RbacTabOption {
  id: RbacTabId;
  label: string;
}

export const RBAC_TAB_OPTIONS: RbacTabOption[] = [
  { id: 'roles', label: 'Roles' },
  { id: 'role-bindings', label: 'RoleBindings' },
  { id: 'cluster-roles', label: 'ClusterRoles' },
  { id: 'cluster-role-bindings', label: 'ClusterRoleBindings' },
];

export interface RbacResource {
  kind: string;
  name: string;
  namespace: string;
  roleRef: string;
  subjects: string;
  subjectCount: number;
  rules: number;
  apiGroups: string;
  resources: string;
  verbs: string;
  age: string;
  createdAtUnix: number;
}
