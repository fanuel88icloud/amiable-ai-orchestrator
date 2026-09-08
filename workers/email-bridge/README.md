# Amiable Email Bridge

Container Node.js dedicato alle caselle che espongono IMAP e SMTP, comprese le PEC. Le Edge
Function Supabase comunicano con il bridge esclusivamente tramite `EMAIL_BRIDGE_SECRET`.

## Variabili richieste

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_CREDENTIALS_ENCRYPTION_KEY` (la stessa chiave Base64 da 32 byte usata dalle Edge Function)
- `EMAIL_BRIDGE_SECRET` (la stessa chiave configurata nelle Edge Function)
- `OPENAI_API_KEY` (solo se sono abilitate risposte automatiche)
- `PORT` (facoltativa, predefinita `8080`)
- `SYNC_INTERVAL_MS` (facoltativa, minimo e valore predefinito `300000`)

Il servizio espone `GET /health`, `POST /verify` e `POST /send`. Gli ultimi due endpoint richiedono
l'header `x-email-bridge-secret` e non devono essere pubblicati senza HTTPS.

## Distribuzione

Costruire il container dalla directory corrente:

```sh
docker build -t amiable-email-bridge .
docker run --env-file .env -p 8080:8080 amiable-email-bridge
```

Impostare infine `EMAIL_BRIDGE_URL` nelle Edge Function con l'URL HTTPS del container. Il bridge
verifica sia IMAP sia SMTP prima di marcare una connessione come operativa.

Per le PEC, le ricevute riconosciute vengono conservate come EML originali nel bucket privato
`email-attachments`, insieme all'hash SHA-256 e agli eventuali allegati.
