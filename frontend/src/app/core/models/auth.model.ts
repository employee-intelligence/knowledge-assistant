/**
 * Wire types for the auth routes, transcribed from the backend's OpenAPI schema
 * (`GET /openapi.json` on https://knowledge-assistant-backend-88gw.onrender.com).
 *
 * This backend uses Bearer tokens, not cookies: `POST /auth/login` answers with
 * an `access_token` that the app keeps in `localStorage` and sends back as an
 * `Authorization: Bearer ...` header. There is no refresh endpoint, no CSRF
 * token and no logout endpoint.
 */

/**
 * Permission level, as the server names it.
 *
 * `staff` and `intern` are the ordinary accounts; only `admin` may reach the
 * `/admin/*` routes. The label shown to a person stays readable in
 * `ROLE_LABELS`.
 */
export type Role = 'admin' | 'staff' | 'intern';

/** `GET /auth/me` response, and one entry of `GET /admin/users`. */
export interface UserDto {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

/** `POST /auth/login` response: the token, and nothing else. */
export interface TokenResponseDto {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** `POST /auth/login` request body. */
export interface LoginRequestDto {
  email: string;
  password: string;
}

/** `POST /auth/register` request body. `role` defaults to `staff` server-side. */
export interface RegisterRequestDto {
  email: string;
  password: string;
  role?: Role;
}

/** `POST /auth/register` response: the created account (no token). */
export type RegisterResponseDto = UserDto;

/** `GET /admin/users` response: a bare list, not wrapped in an object. */
export type UserListDto = UserDto[];

/** `PATCH /admin/users/{user_id}/role` request body. */
export interface UpdateRoleRequestDto {
  role: Role;
}

/** Human-readable names for each role, as they are shown to a person. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  staff: 'Staff',
  intern: 'Intern',
};

/** The roles an administrator may hand out, in the order the picker shows them. */
export const ASSIGNABLE_ROLES: Role[] = ['staff', 'intern', 'admin'];
