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
          segmento_atuacao: string | null;
          objetivo_principal: string | null;
          porte: string | null;
          publico_alvo: string | null;
          marca_descricao: string | null;
          canais_atuacao: string[] | null;
          tipo_conteudo: string[] | null;
          nivel_experiencia: string | null;
          maior_desafio: string | null;
          uso_ia: string | null;
          contexto_json: Json | null;
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
          segmento_atuacao?: string | null;
          objetivo_principal?: string | null;
          porte?: string | null;
          publico_alvo?: string | null;
          marca_descricao?: string | null;
          canais_atuacao?: string[] | null;
          tipo_conteudo?: string[] | null;
          nivel_experiencia?: string | null;
          maior_desafio?: string | null;
          uso_ia?: string | null;
          contexto_json?: Json | null;
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
          segmento_atuacao?: string | null;
          objetivo_principal?: string | null;
          porte?: string | null;
          publico_alvo?: string | null;
          marca_descricao?: string | null;
          canais_atuacao?: string[] | null;
          tipo_conteudo?: string[] | null;
          nivel_experiencia?: string | null;
          maior_desafio?: string | null;
          uso_ia?: string | null;
          contexto_json?: Json | null;
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
      generated_logos: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          prompt: string;
          description: string | null;
          variation_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          prompt: string;
          description?: string | null;
          variation_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          prompt?: string;
          description?: string | null;
          variation_type?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      generated_posts: {
        Row: {
          id: string;
          user_id: string;
          canal: string;
          objetivo: string | null;
          tipo_conteudo: string | null;
          texto_pronto: string;
          cta: string | null;
          sugestao_visual: string | null;
          payload_json: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          canal: string;
          objetivo?: string | null;
          tipo_conteudo?: string | null;
          texto_pronto: string;
          cta?: string | null;
          sugestao_visual?: string | null;
          payload_json?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          canal?: string;
          objetivo?: string | null;
          tipo_conteudo?: string | null;
          texto_pronto?: string;
          cta?: string | null;
          sugestao_visual?: string | null;
          payload_json?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          role?: string;
          content?: string;
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
    Views: {
      user_summary: {
        Row: {
          user_id: string;
          credits: number;
          plan: string;
          images_generated: number;
          posts_generated: number;
          logos_generated: number;
          materials_count: number;
          nome_empresa: string | null;
          segmento: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
