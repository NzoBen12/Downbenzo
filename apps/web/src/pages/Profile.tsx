import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/FilterBar';
import { Badge, Button, Card, Input, useToast } from '../components/ui';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Indique su contraseña actual'),
    newPassword: z.string().min(12, 'Mínimo 12 caracteres').regex(/[a-z]/, 'Incluya minúsculas').regex(/[A-Z]/, 'Incluya mayúsculas').regex(/\d/, 'Incluya números'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });
type Form = z.infer<typeof schema>;

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const change = useMutation({
    mutationFn: (v: Form) => api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => { reset(); toast.show('Contraseña actualizada. Se cerraron sus otras sesiones.', 'success'); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error inesperado', 'error'),
  });
  return (
    <>
      <PageHead title="Mi perfil" />
      <div className="grid cols-2">
        <Card title="Cuenta">
          <dl className="kv"><dt>Nombre</dt><dd>{user?.fullName}</dd><dt>Correo</dt><dd>{user?.email}</dd><dt>Rol</dt><dd><Badge tone="info">{user?.roleCode}</Badge></dd><dt>Permisos</dt><dd>{user?.permissions.length}</dd></dl>
        </Card>
        <Card title="Cambiar contraseña">
          <form className="form-grid" style={{ gridTemplateColumns: '1fr' }} onSubmit={handleSubmit((v) => change.mutate(v))} noValidate>
            <Input label="Contraseña actual" type="password" autoComplete="current-password" {...register('currentPassword')} error={errors.currentPassword?.message} />
            <Input label="Nueva contraseña" type="password" autoComplete="new-password" help="Mín. 12 caracteres, mayúsculas, minúsculas y números" {...register('newPassword')} error={errors.newPassword?.message} />
            <Input label="Confirmar nueva contraseña" type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
            <div><Button type="submit" loading={change.isPending}>Actualizar contraseña</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
