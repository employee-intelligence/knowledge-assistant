/**
 * Wire types for the auth routes, transcribed from the backend's OpenAPI schema.
 *
 * Nothing here is a token, and that is the point of the file existing: the backend
 * keeps both tokens in `httpOnly` cookies that this code cannot read, so there is
 * no type in it to represent one. The only session state the app ever handles is
 * the user the backend describes.
 */

/**
 * Permission level, as the server names it.
 */
export type Role = 'employee' | 'admin';

/** `GET /auth/me` response: the signed-in person. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** `POST /auth/login` response. */
export interface LoginResponseDto {
  user: UserDto;
  message?: string;
}

/** `POST /auth/login` request body. */
export interface LoginRequestDto {
  email: string;
  password: string;
}

/** `POST /auth/register` request body. */
export interface RegisterRequestDto {
  name: string;
  email: string;
  password: string;
}

/** `POST /auth/register` response. */
export interface RegisterResponseDto {
  user: UserDto;
  message?: string;
}

/** `GET /admin/users` response. */
export interface UserListDto {
  users: UserDto[];
}

/** `PATCH /admin/users/{user_id}/role` request body. */
export interface UpdateRoleRequestDto {
  role: Role;
}

/** Human-readable names for each role, as they are shown to a person. */
export const ROLE_LABELS: Record<Role, string> = {
  employee: 'Employee',
  admin: 'Administrator',
};