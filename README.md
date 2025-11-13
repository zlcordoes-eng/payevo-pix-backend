# Backend Payevo PIX

Backend simples para integrar com a API Payevo PIX. Feito para deploy no Railway.

## 🚀 Deploy no Railway

### 1. Criar projeto no Railway

1. Acesse [Railway](https://railway.app)
2. Clique em "New Project"
3. Selecione "Deploy from GitHub repo" ou "Empty Project"

### 2. Configurar variáveis de ambiente

No Railway, vá em **Variables** e adicione:

```
PAYEVO_SECRET_KEY=sk_like_5gOaAP5LWxx6k710bJMZwYNe1qOVNgMwZicy1igGj9H84UPR
PAYEVO_COMPANY_ID=080faefb-4484-49b8-b929-334a47a89624
```

### 3. Fazer deploy

**Opção A: Via GitHub (Recomendado)**
1. Envie este diretório `backend/` para um repositório GitHub
2. No Railway, conecte o repositório
3. Railway detectará automaticamente o `package.json` e fará o deploy

**Opção B: Via Railway CLI**
```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Iniciar projeto
railway init

# Deploy
railway up
```

### 4. Obter URL do backend

Após o deploy, Railway fornecerá uma URL como:
- `https://seu-projeto.up.railway.app`

Copie essa URL e configure no frontend no arquivo `.env`:
```
VITE_BACKEND_API_URL=https://seu-projeto.up.railway.app
```

## 📡 Endpoints

### POST /transactions
Cria uma transação PIX

**Request:**
```json
{
  "customer": {
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "11999999999",
    "document": {
      "number": "00000000000",
      "type": "CPF"
    }
  },
  "amount": 100.00,
  "expiresInDays": 1,
  "productName": "#pedido7826",
  "externalRef": "PED123456"
}
```

**Response:**
```json
{
  "payload": "código_pix_copia_e_cola",
  "qrCode": "base64_ou_url",
  "qrCodeUrl": "url_do_qr_code",
  "transactionId": "id_da_transacao",
  "amount": 100.00,
  "status": "pending"
}
```

### GET /health
Health check do servidor

**Response:**
```json
{
  "status": "ok",
  "message": "Backend Payevo funcionando",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 Desenvolvimento Local

```bash
# Instalar dependências
cd backend
npm install

# Configurar variáveis de ambiente
# Crie um arquivo .env ou exporte as variáveis:
export PAYEVO_SECRET_KEY=sua_chave_aqui
export PAYEVO_COMPANY_ID=seu_id_aqui

# Rodar servidor
npm start
```

O servidor rodará em `http://localhost:3000`

