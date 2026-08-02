// NEXT_PUBLIC_* sao valores publicos por design (o anon key e protegido por RLS no banco).
// Os defaults abaixo apontam para o projeto Supabase "softeum-crm" e podem ser sobrescritos
// via variavel de ambiente no Vercel, se o projeto Supabase mudar no futuro.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gvdiyeomfprevxhgdynw.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZGl5ZW9tZnByZXZ4aGdkeW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTM3NzEsImV4cCI6MjEwMTI2OTc3MX0.UaNsJgTeTxYAT31MR_ugZCjpNp2MKwM6UvNBS5gu7OQ";

export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL || "https://www.softeum.com.br/suporte";
