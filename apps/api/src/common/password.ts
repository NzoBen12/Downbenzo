import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres')
  .max(128)
  .regex(/[a-z]/, 'Debe incluir minúsculas')
  .regex(/[A-Z]/, 'Debe incluir mayúsculas')
  .regex(/\d/, 'Debe incluir números');
