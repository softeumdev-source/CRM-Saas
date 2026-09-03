export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      atividades: {
        Row: {
          concluida: boolean | null
          concluida_em: string | null
          confirmada: boolean | null
          criado_em: string | null
          data_agendada: string | null
          descricao: string | null
          id: string
          lembrete_data: string | null
          lembrete_enviado: boolean | null
          negocio_id: string | null
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          concluida?: boolean | null
          concluida_em?: string | null
          confirmada?: boolean | null
          criado_em?: string | null
          data_agendada?: string | null
          descricao?: string | null
          id?: string
          lembrete_data?: string | null
          lembrete_enviado?: boolean | null
          negocio_id?: string | null
          tipo?: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          concluida?: boolean | null
          concluida_em?: string | null
          confirmada?: boolean | null
          criado_em?: string | null
          data_agendada?: string | null
          descricao?: string | null
          id?: string
          lembrete_data?: string | null
          lembrete_enviado?: boolean | null
          negocio_id?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atividades_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          area: string | null
          atualizado_em: string | null
          cargo: string | null
          cidade: string | null
          cnpj: string | null
          criado_em: string | null
          email: string | null
          empresa: string | null
          estado: string | null
          id: string
          nome: string
          origem: string | null
          responsavel_id: string | null
          sobrenome: string | null
          tags: string[] | null
          telefone: string | null
          telefone_comercial: string | null
          tenant_id: string | null
          whatsapp: string | null
        }
        Insert: {
          area?: string | null
          atualizado_em?: string | null
          cargo?: string | null
          cidade?: string | null
          cnpj?: string | null
          criado_em?: string | null
          email?: string | null
          empresa?: string | null
          estado?: string | null
          id?: string
          nome: string
          origem?: string | null
          responsavel_id?: string | null
          sobrenome?: string | null
          tags?: string[] | null
          telefone?: string | null
          telefone_comercial?: string | null
          tenant_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          area?: string | null
          atualizado_em?: string | null
          cargo?: string | null
          cidade?: string | null
          cnpj?: string | null
          criado_em?: string | null
          email?: string | null
          empresa?: string | null
          estado?: string | null
          id?: string
          nome?: string
          origem?: string | null
          responsavel_id?: string | null
          sobrenome?: string | null
          tags?: string[] | null
          telefone?: string | null
          telefone_comercial?: string | null
          tenant_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          convidado_por: string | null
          criado_em: string | null
          email: string
          expira_em: string
          id: string
          role: string
          status: string
          tenant_id: string | null
          token: string
        }
        Insert: {
          convidado_por?: string | null
          criado_em?: string | null
          email: string
          expira_em?: string
          id?: string
          role?: string
          status?: string
          tenant_id?: string | null
          token?: string
        }
        Update: {
          convidado_por?: string | null
          criado_em?: string | null
          email?: string
          expira_em?: string
          id?: string
          role?: string
          status?: string
          tenant_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      envelopes: {
        Row: {
          campos_assinatura: Json | null
          concluido_em: string | null
          copias_emails: string[] | null
          criado_em: string | null
          id: string
          proposta_id: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          campos_assinatura?: Json | null
          concluido_em?: string | null
          copias_emails?: string[] | null
          criado_em?: string | null
          id?: string
          proposta_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          campos_assinatura?: Json | null
          concluido_em?: string | null
          copias_emails?: string[] | null
          criado_em?: string | null
          id?: string
          proposta_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envelopes_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envelopes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas_pipeline: {
        Row: {
          resultado: string | null
          pipeline_id: string | null
          cor: string | null
          id: string
          nome: string
          ordem: number
          probabilidade: number | null
          tenant_id: string | null
        }
        Insert: {
          resultado?: string | null
          pipeline_id?: string | null
          cor?: string | null
          id?: string
          nome: string
          ordem: number
          probabilidade?: number | null
          tenant_id?: string | null
        }
        Update: {
          resultado?: string | null
          pipeline_id?: string | null
          cor?: string | null
          id?: string
          nome?: string
          ordem?: number
          probabilidade?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etapas_pipeline_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_pipeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_etapa_historico: {
        Row: {
          entrou_em: string
          etapa_id: string | null
          id: string
          negocio_id: string
          saiu_em: string | null
          tenant_id: string
        }
        Insert: {
          entrou_em?: string
          etapa_id?: string | null
          id?: string
          negocio_id: string
          saiu_em?: string | null
          tenant_id: string
        }
        Update: {
          entrou_em?: string
          etapa_id?: string | null
          id?: string
          negocio_id?: string
          saiu_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negocio_etapa_historico_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_etapa_historico_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios: {
        Row: {
          atualizado_em: string | null
          contato_id: string | null
          criado_em: string | null
          data_fechamento_prevista: string | null
          etapa_id: string | null
          fechado_em: string | null
          ganho: boolean | null
          id: string
          motivo_perda: string | null
          pipeline_id: string | null
          prioridade: string | null
          probabilidade: number | null
          responsavel_id: string | null
          tenant_id: string | null
          titulo: string
          ultima_atividade_em: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string | null
          contato_id?: string | null
          criado_em?: string | null
          data_fechamento_prevista?: string | null
          etapa_id?: string | null
          fechado_em?: string | null
          ganho?: boolean | null
          id?: string
          motivo_perda?: string | null
          pipeline_id?: string | null
          prioridade?: string | null
          probabilidade?: number | null
          responsavel_id?: string | null
          tenant_id?: string | null
          titulo: string
          ultima_atividade_em?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string | null
          contato_id?: string | null
          criado_em?: string | null
          data_fechamento_prevista?: string | null
          etapa_id?: string | null
          fechado_em?: string | null
          ganho?: boolean | null
          id?: string
          motivo_perda?: string | null
          pipeline_id?: string | null
          prioridade?: string | null
          probabilidade?: number | null
          responsavel_id?: string | null
          tenant_id?: string | null
          titulo?: string
          ultima_atividade_em?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "negocios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          corpo: string | null
          criado_em: string | null
          id: string
          lida: boolean | null
          link: string | null
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          corpo?: string | null
          criado_em?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          tipo: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          corpo?: string | null
          criado_em?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          chave: string
          criado_em: string | null
          id: string
          nome: string
          pipeline_destino_id: string | null
          role_operador: string
          tenant_id: string | null
        }
        Insert: {
          chave: string
          criado_em?: string | null
          id?: string
          nome: string
          pipeline_destino_id?: string | null
          role_operador?: string
          tenant_id?: string | null
        }
        Update: {
          chave?: string
          criado_em?: string | null
          id?: string
          nome?: string
          pipeline_destino_id?: string | null
          role_operador?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_pipeline_destino_id_fkey"
            columns: ["pipeline_destino_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          descricao: string | null
          franquia_pedidos: number
          id: string
          nome: string
          tenant_id: string | null
          valor_excedente_pedido: number
          valor_plataforma_base: number
          valor_setup_catalogo: number
          valor_setup_erp: number
          valor_setup_plataforma: number
          valor_uso_base: number
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          franquia_pedidos?: number
          id?: string
          nome: string
          tenant_id?: string | null
          valor_excedente_pedido?: number
          valor_plataforma_base?: number
          valor_setup_catalogo?: number
          valor_setup_erp?: number
          valor_setup_plataforma?: number
          valor_uso_base?: number
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          franquia_pedidos?: number
          id?: string
          nome?: string
          tenant_id?: string | null
          valor_excedente_pedido?: number
          valor_plataforma_base?: number
          valor_setup_catalogo?: number
          valor_setup_erp?: number
          valor_setup_plataforma?: number
          valor_uso_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "planos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          aviso_previo_dias: number
          criado_em: string | null
          enviada_em: string | null
          forma_pagamento: string | null
          gerado_por: string | null
          id: string
          negocio_id: string | null
          numero: string
          pdf_assinado_comercial_path: string | null
          pdf_assinado_tecnica_path: string | null
          pdf_comercial_path: string | null
          pdf_tecnica_path: string | null
          plano_id: string | null
          prazo_contrato_meses: number
          qtd_caixas_email: number | null
          qtd_numeros_whatsapp: number | null
          status: string
          tenant_id: string | null
          valor_excedente_pedido: number
          valor_modulo_email: number | null
          valor_modulo_whatsapp: number | null
          valor_plataforma: number
          valor_plataforma_base_snapshot: number
          valor_setup_catalogo: number
          valor_setup_erp: number
          valor_setup_plataforma: number
          valor_uso: number
          valor_uso_base_snapshot: number
          versao: number
        }
        Insert: {
          aviso_previo_dias?: number
          criado_em?: string | null
          enviada_em?: string | null
          forma_pagamento?: string | null
          gerado_por?: string | null
          id?: string
          negocio_id?: string | null
          numero?: string
          pdf_assinado_comercial_path?: string | null
          pdf_assinado_tecnica_path?: string | null
          pdf_comercial_path?: string | null
          pdf_tecnica_path?: string | null
          plano_id?: string | null
          prazo_contrato_meses?: number
          qtd_caixas_email?: number | null
          qtd_numeros_whatsapp?: number | null
          status?: string
          tenant_id?: string | null
          valor_excedente_pedido?: number
          valor_modulo_email?: number | null
          valor_modulo_whatsapp?: number | null
          valor_plataforma?: number
          valor_plataforma_base_snapshot?: number
          valor_setup_catalogo?: number
          valor_setup_erp?: number
          valor_setup_plataforma?: number
          valor_uso?: number
          valor_uso_base_snapshot?: number
          versao?: number
        }
        Update: {
          aviso_previo_dias?: number
          criado_em?: string | null
          enviada_em?: string | null
          forma_pagamento?: string | null
          gerado_por?: string | null
          id?: string
          negocio_id?: string | null
          numero?: string
          pdf_assinado_comercial_path?: string | null
          pdf_assinado_tecnica_path?: string | null
          pdf_comercial_path?: string | null
          pdf_tecnica_path?: string | null
          plano_id?: string | null
          prazo_contrato_meses?: number
          qtd_caixas_email?: number | null
          qtd_numeros_whatsapp?: number | null
          status?: string
          tenant_id?: string | null
          valor_excedente_pedido?: number
          valor_modulo_email?: number | null
          valor_modulo_whatsapp?: number | null
          valor_plataforma?: number
          valor_plataforma_base_snapshot?: number
          valor_setup_catalogo?: number
          valor_setup_erp?: number
          valor_setup_plataforma?: number
          valor_uso?: number
          valor_uso_base_snapshot?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_gerado_por_fkey"
            columns: ["gerado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_distribuicao: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          id: string
          prioridade: number | null
          tenant_id: string | null
          tipo: string
          usuario_id: string | null
          valor: string | null
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          prioridade?: number | null
          tenant_id?: string | null
          tipo?: string
          usuario_id?: string | null
          valor?: string | null
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          prioridade?: number | null
          tenant_id?: string | null
          tipo?: string
          usuario_id?: string | null
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_distribuicao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_distribuicao_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      signatarios: {
        Row: {
          assinado_em: string | null
          assinatura_dados: string | null
          assinatura_tipo: string | null
          criado_em: string | null
          email: string
          email_faturamento: string | null
          envelope_id: string | null
          id: string
          ip_assinatura: string | null
          nome: string
          ordem: number | null
          papel: string
          status: string
          token: string
          user_agent: string | null
          visualizado_em: string | null
        }
        Insert: {
          assinado_em?: string | null
          assinatura_dados?: string | null
          assinatura_tipo?: string | null
          criado_em?: string | null
          email: string
          email_faturamento?: string | null
          envelope_id?: string | null
          id?: string
          ip_assinatura?: string | null
          nome: string
          ordem?: number | null
          papel?: string
          status?: string
          token?: string
          user_agent?: string | null
          visualizado_em?: string | null
        }
        Update: {
          assinado_em?: string | null
          assinatura_dados?: string | null
          assinatura_tipo?: string | null
          criado_em?: string | null
          email?: string
          email_faturamento?: string | null
          envelope_id?: string | null
          id?: string
          ip_assinatura?: string | null
          nome?: string
          ordem?: number | null
          papel?: string
          status?: string
          token?: string
          user_agent?: string | null
          visualizado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatarios_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_desconto: {
        Row: {
          criado_em: string | null
          decidido_em: string | null
          decidido_por: string | null
          id: string
          motivo: string | null
          negocio_id: string
          plano_id: string | null
          resposta_admin: string | null
          status: string
          tenant_id: string
          valor_mensal_base: number
          valor_mensal_solicitado: number
          valor_setup_solicitado: number
          vendedor_id: string | null
        }
        Insert: {
          criado_em?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo?: string | null
          negocio_id: string
          plano_id?: string | null
          resposta_admin?: string | null
          status?: string
          tenant_id: string
          valor_mensal_base?: number
          valor_mensal_solicitado?: number
          valor_setup_solicitado?: number
          vendedor_id?: string | null
        }
        Update: {
          criado_em?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo?: string | null
          negocio_id?: string
          plano_id?: string | null
          resposta_admin?: string | null
          status?: string
          tenant_id?: string
          valor_mensal_base?: number
          valor_mensal_solicitado?: number
          valor_setup_solicitado?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_desconto_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_desconto_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_desconto_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_desconto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_desconto_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cor_primaria: string | null
          criado_em: string | null
          id: string
          logo_url: string | null
          nome: string
          slug: string
        }
        Insert: {
          cor_primaria?: string | null
          criado_em?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          slug: string
        }
        Update: {
          cor_primaria?: string | null
          criado_em?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean | null
          avatar_url: string | null
          criado_em: string | null
          email: string
          id: string
          meta_mensal: number | null
          nome: string
          role: string
          tenant_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          avatar_url?: string | null
          criado_em?: string | null
          email: string
          id: string
          meta_mensal?: number | null
          nome: string
          role?: string
          tenant_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          avatar_url?: string | null
          criado_em?: string | null
          email?: string
          id?: string
          meta_mensal?: number | null
          nome?: string
          role?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceitar_convite: {
        Args: { p_nova_senha: string; p_token: string }
        Returns: {
          email: string
        }[]
      }
      convidar_usuario: {
        Args: { p_email: string; p_nome: string; p_role: string }
        Returns: {
          convite_id: string
          token: string
        }[]
      }
      decidir_desconto: {
        Args: {
          p_aprovar: boolean
          p_resposta?: string
          p_solicitacao_id: string
        }
        Returns: {
          criado_em: string | null
          decidido_em: string | null
          decidido_por: string | null
          id: string
          motivo: string | null
          negocio_id: string
          plano_id: string | null
          resposta_admin: string | null
          status: string
          tenant_id: string
          valor_mensal_base: number
          valor_mensal_solicitado: number
          valor_setup_solicitado: number
          vendedor_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitacoes_desconto"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      distribuir_leads: { Args: { p_contato_ids: string[] }; Returns: number }
      obter_envelope_publico: { Args: { p_token: string }; Returns: Json }
      processar_lembretes: { Args: never; Returns: number }
      registrar_assinatura: {
        Args: {
          p_dados: string
          p_email_faturamento?: string
          p_ip: string
          p_tipo: string
          p_token: string
          p_user_agent: string
        }
        Returns: Json
      }
      salvar_pdf_assinado: {
        Args: {
          p_comercial_url: string
          p_tecnica_url: string
          p_token: string
        }
        Returns: undefined
      }
      solicitar_desconto: {
        Args: {
          p_motivo: string
          p_negocio_id: string
          p_plano_id: string
          p_valor_mensal: number
          p_valor_setup: number
        }
        Returns: {
          criado_em: string | null
          decidido_em: string | null
          decidido_por: string | null
          id: string
          motivo: string | null
          negocio_id: string
          plano_id: string | null
          resposta_admin: string | null
          status: string
          tenant_id: string
          valor_mensal_base: number
          valor_mensal_solicitado: number
          valor_setup_solicitado: number
          vendedor_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitacoes_desconto"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      usuario_role: { Args: never; Returns: string }
      usuario_tenant_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
