export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_credits: {
        Row: {
          id: string;
          user_id: string;
          credits: number;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          credits?: number;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          credits?: number;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_profiles: {
        Row: {
          id: string;
          user_id: string;
          nome_empresa: string | null;
          segmento: string | null;
          porte: string | null;
          publico_alvo: string | null;
          diferenciais: string | null;
          desafios: string | null;
          tom_comunicacao: string | null;
          concorrentes: string | null;
          objetivos_marketing: string | null;
          redes_sociais: string[] | null;
          orcamento_mensal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome_empresa?: string | null;
          segmento?: string | null;
          porte?: string | null;
          publico_alvo?: string | null;
          diferenciais?: string | null;
          desafios?: string | null;
          tom_comunicacao?: string | null;
          concorrentes?: string | null;
          objetivos_marketing?: string | null;
          redes_sociais?: string[] | null;
          orcamento_mensal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nome_empresa?: string | null;
          segmento?: string | null;
          porte?: string | null;
          publico_alvo?: string | null;
          diferenciais?: string | null;
          desafios?: string | null;
          tom_comunicacao?: string | null;
          concorrentes?: string | null;
          objetivos_marketing?: string | null;
          redes_sociais?: string[] | null;
          orcamento_mensal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_materials: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          content: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          content: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          content?: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      generated_images: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          prompt: string;
          optimized_prompt: string | null;
          negative_prompt: string | null;
          quality: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          prompt: string;
          optimized_prompt?: string | null;
          negative_prompt?: string | null;
          quality?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          prompt?: string;
          optimized_prompt?: string | null;
          negative_prompt?: string | null;
          quality?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_orders: {
        Row: {
          id: string;
          user_id: string;
          credits: number;
          amount_cents: number;
          status: string;
          gateway: string;
          gateway_order_id: string | null;
          gateway_payment_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          credits: number;
          amount_cents: number;
          status?: string;
          gateway: string;
          gateway_order_id?: string | null;
          gateway_payment_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          credits?: number;
          amount_cents?: number;
          status?: string;
          gateway?: string;
          gateway_order_id?: string | null;
          gateway_payment_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          count: number;
          window_start: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          count?: number;
          window_start?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          count?: number;
          window_start?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
