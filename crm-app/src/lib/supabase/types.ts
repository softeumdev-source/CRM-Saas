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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      anexos: {
        Row: {
          baixado_em: string | null
          caminho: string | null
          criado_em: string
          erro: string | null
          externo_id: string | null
          id: string
          mensagem_id: string | null
          mime: string | null
          negocio_id: string
          nome: string
          origem: string
          tamanho: number | null
          tenant_id: string | null
        }
        Insert: {
          baixado_em?: string | null
          caminho?: string | null
          criado_em?: string
          erro?: string | null
          externo_id?: string | null
          id?: string
          mensagem_id?: string | null
          mime?: string | null
          negocio_id: string
          nome: string
          origem: string
          tamanho?: number | null
          tenant_id?: string | null
        }
        Update: {
          baixado_em?: string | null
          caminho?: string | null
          criado_em?: string
          erro?: string | null
          externo_id?: string | null
          id?: string
          mensagem_id?: string | null
          mime?: string | null
          negocio_id?: string
          nome?: string
          origem?: string
          tamanho?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          compareceu: boolean | null
          concluida: boolean | null
          concluida_em: string | null
          confirmada: boolean | null
          criado_em: string | null
          data_agendada: string | null
          descricao: string | null
          google_evento_id: string | null
          google_meet_link: string | null
          google_resposta: string | null
          id: string
          lembrete_data: string | null
          lembrete_enviado: boolean | null
          negocio_id: string | null
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          compareceu?: boolean | null
          concluida?: boolean | null
          concluida_em?: string | null
          confirmada?: boolean | null
          criado_em?: string | null
          data_agendada?: string | null
          descricao?: string | null
          google_evento_id?: string | null
          google_meet_link?: string | null
          google_resposta?: string | null
          id?: string
          lembrete_data?: string | null
          lembrete_enviado?: boolean | null
          negocio_id?: string | null
          tipo?: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          compareceu?: boolean | null
          concluida?: boolean | null
          concluida_em?: string | null
          confirmada?: boolean | null
          criado_em?: string | null
          data_agendada?: string | null
          descricao?: string | null
          google_evento_id?: string | null
          google_meet_link?: string | null
          google_resposta?: string | null
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
      cadencia_inscricoes: {
        Row: {
          cadencia_id: string
          criado_em: string | null
          id: string
          inscrito_por: string | null
          negocio_id: string
          passo_atual: number
          proximo_envio_em: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          cadencia_id: string
          criado_em?: string | null
          id?: string
          inscrito_por?: string | null
          negocio_id: string
          passo_atual?: number
          proximo_envio_em?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          cadencia_id?: string
          criado_em?: string | null
          id?: string
          inscrito_por?: string | null
          negocio_id?: string
          passo_atual?: number
          proximo_envio_em?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_inscricoes_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_inscrito_por_fkey"
            columns: ["inscrito_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencia_passos: {
        Row: {
          atraso_horas: number
          cadencia_id: string
          canal: string
          id: string
          ordem: number
          parar_se_respondeu: boolean
          template_id: string | null
        }
        Insert: {
          atraso_horas?: number
          cadencia_id: string
          canal?: string
          id?: string
          ordem: number
          parar_se_respondeu?: boolean
          template_id?: string | null
        }
        Update: {
          atraso_horas?: number
          cadencia_id?: string
          canal?: string
          id?: string
          ordem?: number
          parar_se_respondeu?: boolean
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_passos_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_passos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates_mensagem"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencias: {
        Row: {
          ativa: boolean
          autonoma: boolean
          criado_em: string | null
          id: string
          nome: string
          pipeline_id: string | null
          tenant_id: string | null
          tipo: string
        }
        Insert: {
          ativa?: boolean
          autonoma?: boolean
          criado_em?: string | null
          id?: string
          nome: string
          pipeline_id?: string | null
          tenant_id?: string | null
          tipo?: string
        }
        Update: {
          ativa?: boolean
          autonoma?: boolean
          criado_em?: string | null
          id?: string
          nome?: string
          pipeline_id?: string | null
          tenant_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencias_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos: {
        Row: {
          aceito_em: string | null
          canal: string
          contato_id: string
          id: string
          ip: string | null
          origem: string | null
          revogado_em: string | null
          tenant_id: string | null
          texto_aceito: string | null
          user_agent: string | null
        }
        Insert: {
          aceito_em?: string | null
          canal: string
          contato_id: string
          id?: string
          ip?: string | null
          origem?: string | null
          revogado_em?: string | null
          tenant_id?: string | null
          texto_aceito?: string | null
          user_agent?: string | null
        }
        Update: {
          aceito_em?: string | null
          canal?: string
          contato_id?: string
          id?: string
          ip?: string | null
          origem?: string | null
          revogado_em?: string | null
          tenant_id?: string | null
          texto_aceito?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          cor: string | null
          funcao: string | null
          id: string
          nome: string
          ordem: number
          pipeline_id: string | null
          probabilidade: number | null
          resultado: string | null
          tenant_id: string | null
        }
        Insert: {
          cor?: string | null
          funcao?: string | null
          id?: string
          nome: string
          ordem: number
          pipeline_id?: string | null
          probabilidade?: number | null
          resultado?: string | null
          tenant_id?: string | null
        }
        Update: {
          cor?: string | null
          funcao?: string | null
          id?: string
          nome?: string
          ordem?: number
          pipeline_id?: string | null
          probabilidade?: number | null
          resultado?: string | null
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
      integracoes_google: {
        Row: {
          atualizado_em: string | null
          conectado_em: string | null
          email_google: string
          escopos: string[]
          gmail_erro: string | null
          gmail_history_id: string | null
          gmail_sincronizado_em: string | null
          id: string
          refresh_token_id: string | null
          tenant_id: string | null
          ultimo_erro: string | null
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string | null
          conectado_em?: string | null
          email_google: string
          escopos?: string[]
          gmail_erro?: string | null
          gmail_history_id?: string | null
          gmail_sincronizado_em?: string | null
          id?: string
          refresh_token_id?: string | null
          tenant_id?: string | null
          ultimo_erro?: string | null
          usuario_id: string
        }
        Update: {
          atualizado_em?: string | null
          conectado_em?: string | null
          email_google?: string
          escopos?: string[]
          gmail_erro?: string | null
          gmail_history_id?: string | null
          gmail_sincronizado_em?: string | null
          id?: string
          refresh_token_id?: string | null
          tenant_id?: string | null
          ultimo_erro?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_google_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracoes_google_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          agendada_para: string | null
          aprovada_em: string | null
          aprovada_por: string | null
          assunto: string | null
          automatica: boolean
          canal: string
          contato_id: string | null
          corpo: string
          corpo_formato: string
          criado_em: string | null
          destino: string | null
          direcao: string
          enviada_em: string | null
          erro_codigo: string | null
          gerado_por: string
          id: string
          idempotency_key: string | null
          in_reply_to: string | null
          inscricao_id: string | null
          message_id_externo: string | null
          negocio_id: string | null
          passo_id: string | null
          provedor_id: string | null
          proxima_tentativa_em: string | null
          recebida_em: string | null
          reservada_em: string | null
          status: string
          template_externo: string | null
          tenant_id: string | null
          tentativas: number
          thread_externo: string | null
          ultimo_erro: string | null
          variaveis: string[] | null
        }
        Insert: {
          agendada_para?: string | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          assunto?: string | null
          automatica?: boolean
          canal?: string
          contato_id?: string | null
          corpo: string
          corpo_formato?: string
          criado_em?: string | null
          destino?: string | null
          direcao?: string
          enviada_em?: string | null
          erro_codigo?: string | null
          gerado_por?: string
          id?: string
          idempotency_key?: string | null
          in_reply_to?: string | null
          inscricao_id?: string | null
          message_id_externo?: string | null
          negocio_id?: string | null
          passo_id?: string | null
          provedor_id?: string | null
          proxima_tentativa_em?: string | null
          recebida_em?: string | null
          reservada_em?: string | null
          status?: string
          template_externo?: string | null
          tenant_id?: string | null
          tentativas?: number
          thread_externo?: string | null
          ultimo_erro?: string | null
          variaveis?: string[] | null
        }
        Update: {
          agendada_para?: string | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          assunto?: string | null
          automatica?: boolean
          canal?: string
          contato_id?: string | null
          corpo?: string
          corpo_formato?: string
          criado_em?: string | null
          destino?: string | null
          direcao?: string
          enviada_em?: string | null
          erro_codigo?: string | null
          gerado_por?: string
          id?: string
          idempotency_key?: string | null
          in_reply_to?: string | null
          inscricao_id?: string | null
          message_id_externo?: string | null
          negocio_id?: string | null
          passo_id?: string | null
          provedor_id?: string | null
          proxima_tentativa_em?: string | null
          recebida_em?: string | null
          reservada_em?: string | null
          status?: string
          template_externo?: string | null
          tenant_id?: string | null
          tentativas?: number
          thread_externo?: string | null
          ultimo_erro?: string | null
          variaveis?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_aprovada_por_fkey"
            columns: ["aprovada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "cadencia_inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_passo_id_fkey"
            columns: ["passo_id"]
            isOneToOne: false
            referencedRelation: "cadencia_passos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_sem_negocio: {
        Row: {
          assunto: string | null
          canal: string
          candidatos: Json | null
          criado_em: string
          externo_id: string | null
          id: string
          motivo: string
          recebida_em: string | null
          remetente: string
          resolvido_em: string | null
          resolvido_negocio_id: string | null
          tenant_id: string | null
          thread_externo: string | null
          usuario_id: string | null
        }
        Insert: {
          assunto?: string | null
          canal: string
          candidatos?: Json | null
          criado_em?: string
          externo_id?: string | null
          id?: string
          motivo: string
          recebida_em?: string | null
          remetente: string
          resolvido_em?: string | null
          resolvido_negocio_id?: string | null
          tenant_id?: string | null
          thread_externo?: string | null
          usuario_id?: string | null
        }
        Update: {
          assunto?: string | null
          canal?: string
          candidatos?: Json | null
          criado_em?: string
          externo_id?: string | null
          id?: string
          motivo?: string
          recebida_em?: string | null
          remetente?: string
          resolvido_em?: string | null
          resolvido_negocio_id?: string | null
          tenant_id?: string | null
          thread_externo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_sem_negocio_resolvido_negocio_id_fkey"
            columns: ["resolvido_negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_sem_negocio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_sem_negocio_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
          respostas_lidas_em: string | null
          respostas_nao_lidas: number
          retomar_em: string | null
          tenant_id: string | null
          titulo: string
          vendedor_origem_id: string | null
          ultima_atividade_em: string | null
          ultima_resposta_canal: string | null
          ultima_resposta_em: string | null
          ultima_resposta_whatsapp_em: string | null
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
          respostas_lidas_em?: string | null
          respostas_nao_lidas?: number
          retomar_em?: string | null
          tenant_id?: string | null
          titulo: string
          vendedor_origem_id?: string | null
          ultima_atividade_em?: string | null
          ultima_resposta_canal?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_whatsapp_em?: string | null
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
          respostas_lidas_em?: string | null
          respostas_nao_lidas?: number
          retomar_em?: string | null
          tenant_id?: string | null
          titulo?: string
          vendedor_origem_id?: string | null
          ultima_atividade_em?: string | null
          ultima_resposta_canal?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_whatsapp_em?: string | null
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
      templates_mensagem: {
        Row: {
          assunto: string | null
          ativo: boolean
          canal: string
          categoria: string
          corpo: string
          criado_em: string | null
          id: string
          nome: string
          template_externo_id: string | null
          tenant_id: string | null
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean
          canal?: string
          categoria?: string
          corpo: string
          criado_em?: string | null
          id?: string
          nome: string
          template_externo_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          assunto?: string | null
          ativo?: boolean
          canal?: string
          categoria?: string
          corpo?: string
          criado_em?: string | null
          id?: string
          nome?: string
          template_externo_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          caixa_email_usuario_id: string | null
          cor_primaria: string | null
          criado_em: string | null
          id: string
          logo_url: string | null
          nome: string
          slug: string
        }
        Insert: {
          caixa_email_usuario_id?: string | null
          cor_primaria?: string | null
          criado_em?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          slug: string
        }
        Update: {
          caixa_email_usuario_id?: string | null
          cor_primaria?: string | null
          criado_em?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_caixa_email_usuario_id_fkey"
            columns: ["caixa_email_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_config: {
        Row: {
          criado_em: string | null
          horas_entre_mensagens_por_lead: number
          id: string
          janela_monitor: number
          limite_por_dia: number
          limite_por_hora: number
          limite_taxa_falha: number
          numero_exibicao: string | null
          numero_id: string | null
          pausado: boolean
          pausado_automaticamente: boolean
          pausado_em: string | null
          pausado_motivo: string | null
          tenant_id: string
        }
        Insert: {
          criado_em?: string | null
          horas_entre_mensagens_por_lead?: number
          id?: string
          janela_monitor?: number
          limite_por_dia?: number
          limite_por_hora?: number
          limite_taxa_falha?: number
          numero_exibicao?: string | null
          numero_id?: string | null
          pausado?: boolean
          pausado_automaticamente?: boolean
          pausado_em?: string | null
          pausado_motivo?: string | null
          tenant_id: string
        }
        Update: {
          criado_em?: string | null
          horas_entre_mensagens_por_lead?: number
          id?: string
          janela_monitor?: number
          limite_por_dia?: number
          limite_por_hora?: number
          limite_taxa_falha?: number
          numero_exibicao?: string | null
          numero_id?: string | null
          pausado?: boolean
          pausado_automaticamente?: boolean
          pausado_em?: string | null
          pausado_motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
      concluir_envio: {
        Args: {
          p_erro?: string
          p_erro_codigo?: string
          p_id: string
          p_message_id_externo?: string
          p_ok: boolean
          p_provedor_id?: string
          p_thread_externo?: string
        }
        Returns: string
      }
      contagem_negocios_por_etapa: {
        Args: { p_pipeline_id: string }
        Returns: {
          etapa_id: string
          total: number
        }[]
      }
      contatos_por_telefone: {
        Args: { p_numero: string }
        Returns: {
          id: string
          nome: string
          tenant_id: string
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
      disparar_despacho: { Args: never; Returns: string }
      disparar_sync_gmail: { Args: never; Returns: string }
      distribuir_leads: { Args: { p_contato_ids: string[] }; Returns: number }
      google_guardar_refresh_token: {
        Args: {
          p_email: string
          p_escopos?: string[]
          p_refresh_token: string
          p_usuario_id: string
        }
        Returns: string
      }
      google_obter_refresh_token: {
        Args: { p_usuario_id: string }
        Returns: string
      }
      google_registrar_erro: {
        Args: { p_erro: string; p_usuario_id: string }
        Returns: undefined
      }
      negocios_do_board: {
        Args: { p_pipeline_id: string; p_por_etapa?: number }
        Returns: {
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
          respostas_lidas_em: string | null
          respostas_nao_lidas: number
          retomar_em: string | null
          tenant_id: string | null
          titulo: string
          ultima_atividade_em: string | null
          ultima_resposta_canal: string | null
          ultima_resposta_em: string | null
          ultima_resposta_whatsapp_em: string | null
          valor: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "negocios"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      obter_envelope_publico: { Args: { p_token: string }; Returns: Json }
      pipelines_do_meu_papel: { Args: never; Returns: string[] }
      processar_cadencias: { Args: never; Returns: number }
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
      reservar_mensagens: {
        Args: { p_limite?: number }
        Returns: {
          agendada_para: string | null
          aprovada_em: string | null
          aprovada_por: string | null
          assunto: string | null
          automatica: boolean
          canal: string
          contato_id: string | null
          corpo: string
          corpo_formato: string
          criado_em: string | null
          destino: string | null
          direcao: string
          enviada_em: string | null
          erro_codigo: string | null
          gerado_por: string
          id: string
          idempotency_key: string | null
          in_reply_to: string | null
          inscricao_id: string | null
          message_id_externo: string | null
          negocio_id: string | null
          passo_id: string | null
          provedor_id: string | null
          proxima_tentativa_em: string | null
          recebida_em: string | null
          reservada_em: string | null
          status: string
          template_externo: string | null
          tenant_id: string | null
          tentativas: number
          thread_externo: string | null
          ultimo_erro: string | null
          variaveis: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mensagens"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      retomar_leads_em_nutricao: { Args: never; Returns: number }
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
      telefone_chave: { Args: { p: string }; Returns: string }
      transferir_negocio_de_funil: {
        Args: {
          p_descricao?: string
          p_etapa_destino_id: string
          p_negocio_id: string
          p_responsavel_id?: string
          p_titulo?: string
        }
        Returns: string
      }
      usuario_role: { Args: never; Returns: string }
      usuario_tenant_id: { Args: never; Returns: string }
      whatsapp_avaliar_bloqueio: {
        Args: { p_tenant: string }
        Returns: boolean
      }
      whatsapp_folga: { Args: { p_tenant: string }; Returns: number }
      whatsapp_lead_em_espera: {
        Args: { p_mensagem: string; p_negocio: string; p_tenant: string }
        Returns: boolean
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
