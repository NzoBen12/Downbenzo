import { Global, Module } from '@nestjs/common';
import { Env, loadEnv } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService, ENV } from './auth.service';
import { AUTH_PROVIDER } from './auth.types';
import { CorporateAuthProvider } from './corporate-auth.provider';
import { LocalAuthProvider } from './local-auth.provider';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    LocalAuthProvider,
    CorporateAuthProvider,
    {
      provide: AUTH_PROVIDER,
      inject: [ENV, LocalAuthProvider, CorporateAuthProvider],
      useFactory: (env: Env, local: LocalAuthProvider, corp: CorporateAuthProvider) =>
        env.AUTH_PROVIDER === 'corporate' ? corp : local,
    },
    AuthService,
  ],
  exports: [AuthService, ENV],
})
export class AuthModule {}
