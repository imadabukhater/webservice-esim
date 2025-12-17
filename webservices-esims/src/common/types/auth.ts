import { Role } from '../../auth/role';
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}
export interface Session {
  userId: number;
  email: string;
  role: Role;
}