import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProvider } from './auth.types';

/** Proveedor local para desarrollo/entornos sin SSO. Contraseñas con argon2id. */
@Injectable()
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local';
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(identifier: string, secret: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }], deletedAt: null },
    });
    if (!user?.passwordHash) {
      // Gasto de tiempo equivalente para no revelar existencia de usuario.
      await argon2.hash(secret).catch(() => undefined);
      return null;
    }
    const ok = await argon2.verify(user.passwordHash, secret);
    return ok ? { userId: user.id } : null;
  }
}
