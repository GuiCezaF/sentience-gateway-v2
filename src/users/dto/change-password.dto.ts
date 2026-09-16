import { z } from 'zod';

export const rawChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long')
    .max(128, 'New password must not exceed 128 characters'),
});

export const changePasswordSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  return {
    currentPassword: obj.currentPassword ?? obj.current_password,
    newPassword: obj.newPassword ?? obj.new_password,
  };
}, rawChangePasswordSchema);

export type ChangePasswordDto = z.infer<typeof rawChangePasswordSchema>;
