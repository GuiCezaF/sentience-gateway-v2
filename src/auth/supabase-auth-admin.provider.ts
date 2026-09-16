import type {
  AdminUserResult,
  AuthAdminProvider,
  AuthSessionResult,
  CreateAdminUserParams,
  SignInWithPasswordParams,
} from './auth-admin-provider.interface.js';

export class SupabaseAuthAdminProvider implements AuthAdminProvider {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    customFetch?: typeof fetch,
  ) {
    this.baseUrl = supabaseUrl.replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
    this.fetchFn = customFetch ?? fetch;
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createUser(params: CreateAdminUserParams): Promise<AdminUserResult> {
    const url = `${this.baseUrl}/auth/v1/admin/users`;
    const body = {
      email: params.email,
      password: params.password,
      email_confirm: params.emailConfirm ?? true,
      user_metadata: params.userMetadata ?? {},
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
        error_description?: string;
      };
      const message =
        errorData.msg ||
        errorData.message ||
        errorData.error_description ||
        `Supabase admin createUser failed with status ${response.status}`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }

    const data = (await response.json()) as { id: string; email: string };
    return {
      id: data.id,
      email: data.email,
    };
  }

  async deleteUser(id: string): Promise<void> {
    const url = `${this.baseUrl}/auth/v1/admin/users/${id}`;

    const response = await this.fetchFn(url, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok && response.status !== 404) {
      const errorData = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
      };
      const message =
        errorData.msg ||
        errorData.message ||
        `Supabase admin deleteUser failed with status ${response.status}`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const url = `${this.baseUrl}/auth/v1/admin/users/${id}`;
    const body = { password: newPassword };

    const response = await this.fetchFn(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
      };
      const message =
        errorData.msg ||
        errorData.message ||
        `Supabase admin updatePassword failed with status ${response.status}`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }
  }

  async verifyCredentials(email: string, password: string): Promise<boolean> {
    const url = `${this.baseUrl}/auth/v1/token?grant_type=password`;
    const body = { email, password };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        apikey: this.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  }

  async signInWithPassword(
    params: SignInWithPasswordParams,
  ): Promise<AuthSessionResult | null> {
    const url = `${this.baseUrl}/auth/v1/token?grant_type=password`;
    const body = { email: params.email, password: params.password };

    const headers: Record<string, string> = {
      apikey: this.serviceRoleKey,
      'Content-Type': 'application/json',
    };

    if (params.clientIp) {
      headers['X-Forwarded-For'] = params.clientIp;
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 400) {
      return null;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
        error_description?: string;
      };
      const message =
        errorData.msg ||
        errorData.message ||
        errorData.error_description ||
        `Supabase admin signInWithPassword failed with status ${response.status}`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in: number;
      user: { id: string };
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type || 'bearer',
      expiresIn: data.expires_in,
      authId: data.user.id,
    };
  }

  async refreshToken(
    refreshToken: string,
    clientIp?: string,
  ): Promise<AuthSessionResult | null> {
    const url = `${this.baseUrl}/auth/v1/token?grant_type=refresh_token`;
    const body = { refresh_token: refreshToken };

    const headers: Record<string, string> = {
      apikey: this.serviceRoleKey,
      'Content-Type': 'application/json',
    };

    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 400 || response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
        error_description?: string;
      };
      const message =
        errorData.msg ||
        errorData.message ||
        errorData.error_description ||
        `Supabase admin refreshToken failed with status ${response.status}`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in: number;
      user: { id: string };
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type || 'bearer',
      expiresIn: data.expires_in,
      authId: data.user.id,
    };
  }
}
