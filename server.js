/**
 * Backend para integração com API Payevo PIX
 * Deploy no Railway: https://railway.app
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Configurações da Payevo (do arquivo .env no Railway)
const PAYEVO_SECRET_KEY = process.env.PAYEVO_SECRET_KEY;
const PAYEVO_COMPANY_ID = process.env.PAYEVO_COMPANY_ID;
const PAYEVO_API_URL = 'https://apiv2.payevo.com.br/functions/v1/transactions';

// Validar configurações
if (!PAYEVO_SECRET_KEY || !PAYEVO_COMPANY_ID) {
  console.error('⚠️  ERRO: PAYEVO_SECRET_KEY e PAYEVO_COMPANY_ID devem estar configurados nas variáveis de ambiente do Railway!');
}

/**
 * Endpoint de health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend Payevo funcionando',
    timestamp: new Date().toISOString()
  });
});

/**
 * Criar transação PIX
 * POST /transactions
 */
app.post('/transactions', async (req, res) => {
  try {
    // Validar credenciais
    if (!PAYEVO_SECRET_KEY || !PAYEVO_COMPANY_ID) {
      return res.status(500).json({
        error: 'Configuração do servidor incompleta',
        message: 'As credenciais da Payevo não foram configuradas no Railway'
      });
    }

    // Validar dados recebidos
    const { customer, amount, expiresInDays, productName, externalRef } = req.body;

    if (!customer || !amount || !customer.name || !customer.email || !customer.phone || !customer.document) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'É necessário fornecer: customer (name, email, phone, document), amount'
      });
    }

    // Converter amount para número e validar
    const amountNumber = parseFloat(amount);
    
    if (isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        error: 'Valor inválido',
        message: 'O valor deve ser um número maior que zero'
      });
    }

    // Verificar valor mínimo (Payevo geralmente tem um valor mínimo, por exemplo 1 real)
    // Ajuste este valor conforme necessário
    const MINIMUM_AMOUNT = 1.0;
    if (amountNumber < MINIMUM_AMOUNT) {
      return res.status(400).json({
        error: 'Valor muito baixo',
        message: `O valor mínimo é R$ ${MINIMUM_AMOUNT.toFixed(2)}`
      });
    }

    // Preparar requisição para API Payevo
    const authToken = Buffer.from(`${PAYEVO_SECRET_KEY}:x`).toString('base64');

    const requestBody = {
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone.replace(/\D/g, ''), // Remover formatação
        document: {
          number: customer.document.number.replace(/\D/g, ''), // Remover formatação
          type: customer.document.type || 'CPF'
        }
      },
      paymentMethod: 'PIX',
      pix: {
        expiresInDays: expiresInDays || 1
      },
      amount: amountNumber, // Número, não string
      items: [
        {
          title: productName || `#pedido${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          unitPrice: amountNumber, // Número, não string
          quantity: 1,
          externalRef: externalRef || `PED${Date.now()}`
        }
      ],
      companyId: PAYEVO_COMPANY_ID
    };

    // Fazer requisição para API Payevo
    const response = await fetch(PAYEVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'authorization': `Basic ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();

    // Tentar parsear JSON
    let responseData;
    try {
      // Limpar resposta se começar com número (algumas respostas da Payevo começam com 0 ou número)
      let cleanedResponse = responseText.trim();
      
      // Se a resposta começa com número seguido de texto, extrair só o texto
      if (/^\d+\s/.test(cleanedResponse)) {
        cleanedResponse = cleanedResponse.replace(/^\d+\s+/, '');
      }
      
      responseData = JSON.parse(cleanedResponse);
    } catch (e) {
      // Se não for JSON, é uma mensagem de erro em texto da Payevo
      console.error('Erro ao parsear resposta da Payevo:', responseText);
      
      // Tratar erro específico sobre taxas
      if (responseText.includes('taxas') || responseText.includes('taxa')) {
        return res.status(400).json({
          error: 'Erro no valor',
          message: 'O valor informado não é suficiente após as taxas. Tente um valor maior.',
          details: responseText
        });
      }
      
      return res.status(response.status || 500).json({
        error: 'Erro na API Payevo',
        message: responseText || 'Erro desconhecido',
        status: response.status,
        rawResponse: responseText
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: responseData.error || 'Erro na API Payevo',
        message: responseData.message || responseData.details || responseText,
        details: responseData
      });
    }

    // Retornar resposta formatada
    res.json({
      payload: responseData.payload || responseData.pixCopyPaste || responseData.pix?.copyPaste || '',
      qrCode: responseData.qrCode || responseData.pix?.qrCode || responseData.qrCodeBase64 || '',
      qrCodeUrl: responseData.qrCodeUrl || responseData.pix?.qrCodeUrl || '',
      transactionId: responseData.id || responseData.transactionId || responseData.transaction?.id || '',
      amount: responseData.amount || amount,
      status: responseData.status || 'pending'
    });

  } catch (error) {
    console.error('Erro ao processar transação:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message || 'Erro desconhecido'
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  
  if (!PAYEVO_SECRET_KEY || !PAYEVO_COMPANY_ID) {
    console.warn('⚠️  ATENÇÃO: Configure PAYEVO_SECRET_KEY e PAYEVO_COMPANY_ID nas variáveis de ambiente!');
  } else {
    console.log('✅ Credenciais Payevo configuradas');
  }
});

