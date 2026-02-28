export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName: string;
}

export interface AuthResponse {
    token: string;
    refreshToken: string;
    expiration: string;
    user: User;
}
