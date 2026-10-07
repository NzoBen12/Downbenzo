import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermissions = (...p: string[]) => SetMetadata(PERMISSIONS, p);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const Ctx = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return { user: req.user, ip: req.ip, requestId: req.requestId };
});
