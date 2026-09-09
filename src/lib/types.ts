export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      signups: {
        Row: {
          id: string
          first_name: string
          last_name: string
          court_number: number
          status: 'waiting' | 'done'
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          court_number: number
          status?: 'waiting' | 'done'
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          court_number?: number
          status?: 'waiting' | 'done'
          created_by?: string
          created_at?: string
        }
      }
      admins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
      }
    }
  }
}

export type Signup = Database['public']['Tables']['signups']['Row'];
export type SignupInsert = Database['public']['Tables']['signups']['Insert'];
export type SignupUpdate = Database['public']['Tables']['signups']['Update'];
