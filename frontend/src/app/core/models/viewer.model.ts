/** The permission level a signed-in person holds. */
export type Role = 'employee' | 'administrator';

/** The person every screen is rendered for. */
export interface Viewer {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  role: Role;
}

/** Human-readable names for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  employee: 'Employee',
  administrator: 'HR Administrator',
};

/**
 * The viewer shown while authentication is still being designed. The preview
 * toggle swaps only the role so both signed-in experiences can be reviewed.
 */
export const MOCK_VIEWER: Viewer = {
  id: 'viewer-1',
  name: 'Ama Konadu',
  email: 'ama.konadu@acmetech.example',
  jobTitle: 'People Operations',
  role: 'employee',
};
