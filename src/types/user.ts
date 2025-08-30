export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: 'admin' | 'user';
  password: string;
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  role: 'admin' | 'user';
}