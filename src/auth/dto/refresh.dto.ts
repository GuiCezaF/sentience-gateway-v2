import { z } from 'zod';

export const rawRefreshSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required'),
});

export const refreshSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  return {
    refreshToken: obj.refreshToken ?? obj.refresh_token,
  };
}, rawRefreshSchema);

export type RefreshDto = z.infer<typeof rawRefreshSchema>;

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}
