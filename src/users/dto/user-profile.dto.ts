export interface UserCompanyInfo {
  id: string;
  cnpj: string;
  legal_name: string;
  email_domain: string;
}

export interface UserProfileResponse {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  cpf: string;
  status: string;
  must_change_password: boolean;
  company: UserCompanyInfo;
  roles: string[];
  created_at: string;
  updated_at: string;
}
