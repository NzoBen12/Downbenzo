import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Input } from '../components/ui';
import { useState } from 'react';

const schema = z.object({ identifier: z.string().min(1, 'Indique su usuario o correo'), password: z.string().min(1, 'Indique su contraseña') });
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (v: Form) => {
    setError('');
    try {
      await login(v.identifier, v.password);
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 423 ? 'Cuenta bloqueada temporalmente. Inténtelo más tarde.' : e.status === 429 ? 'Demasiados intentos. Espere un minuto.' : e.message) : 'Error inesperado');
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Inicio de sesión">
        <div className="row"><span className="brand-mark" style={{ background: 'var(--c-primary)', color: '#fff' }} aria-hidden="true">B</span><h1>Agenda Comercial BANGE</h1></div>
        {sessionExpired && <p role="alert" className="badge warn">Su sesión ha expirado. Vuelva a iniciar sesión.</p>}
        {error && <p role="alert" className="badge danger">{error}</p>}
        <Input label="Usuario o correo" autoComplete="username" {...register('identifier')} error={errors.identifier?.message} />
        <Input label="Contraseña" type="password" autoComplete="current-password" {...register('password')} error={errors.password?.message} />
        <Button type="submit" loading={isSubmitting}>Iniciar sesión</Button>
      </form>
    </div>
  );
}
