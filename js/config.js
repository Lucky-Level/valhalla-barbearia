// Valhalla Barbearia - Configuracao
const CONFIG = {
  // Supabase (mesmo projeto: owkvgdjcobmuacnztzee)
  SUPABASE_URL: 'https://owkvgdjcobmuacnztzee.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93a3ZnZGpjb2JtdWFjbnp0emVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTkxNTQsImV4cCI6MjA5MTU3NTE1NH0.cvx4o9uFYOlVphl1_Sd8j8y-AxyCTi5xHxZHt0foyXI',

  // WhatsApp do barbeiro (numero sem + e sem espacos, formato BR)
  WHATSAPP_NUMBER: '5562991815709',

  // Tolerancia de atraso (informativo pro cliente)
  LATE_TOLERANCE_MINUTES: 5,

  // Prefixo das tabelas no Supabase (isolamento por cliente)
  TABLE_PREFIX: 'valhalla_',

  // Mensagem WhatsApp template
  // Variaveis: {name}, {phone}, {service}, {date}, {time}
  WHATSAPP_MESSAGE: 'Oi, agendei {service} com {barber} para {date} as {time}. - {name}, {phone}'
};
