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
const PAYEVO_API_URL = 'https://apiv2.payevo.com.br/functions/v1/transactions';

// Validar configurações
if (!PAYEVO_SECRET_KEY) {
  console.error('⚠️  ERRO: PAYEVO_SECRET_KEY deve estar configurada nas variáveis de ambiente do Railway!');
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
    if (!PAYEVO_SECRET_KEY) {
      return res.status(500).json({
        error: 'Configuração do servidor incompleta',
        message: 'A chave secreta da Payevo não foi configurada no Railway. Configure PAYEVO_SECRET_KEY nas variáveis de ambiente.'
      });
    }

    // Validar dados recebidos
    const { customer, amount, expiresInDays, productName, externalRef } = req.body;

    console.log('📥 Dados recebidos:', JSON.stringify(req.body, null, 2));

    if (!customer || !amount || !customer.name || !customer.email || !customer.phone || !customer.document) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'É necessário fornecer: customer (name, email, phone, document), amount'
      });
    }

    // Converter amount para número e validar
    // IMPORTANTE: Garantir 2 casas decimais como na integração que funciona
    // Se receber 30, converter para 30.00 (mantém decimais explícitos)
    let amountNumber = parseFloat(amount);
    
    if (isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        error: 'Valor inválido',
        message: 'O valor deve ser um número maior que zero'
      });
    }

    // IMPORTANTE: Na integração que funciona, o amount é enviado como inteiro
    // Não precisamos converter para decimal e depois para inteiro
    // Converter diretamente para inteiro como na integração que funciona
    const amountInt = Math.round(amountNumber);

    // Preparar requisição para API Payevo
    // IMPORTANTE: Basic Auth = Base64(SECRET_KEY:x)
    const authToken = Buffer.from(`${PAYEVO_SECRET_KEY}:x`).toString('base64');
    console.log('🔑 Auth Token (primeiros 20 chars):', authToken.substring(0, 20) + '...');

    // Preparar requestBody EXATAMENTE como na integração que funciona
    // ORDEM É IMPORTANTE: customer, paymentMethod, pix, amount, items (sem vírgula extra!)
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
      amount: amountInt, // Enviar como inteiro (ex: 30)
      items: [
        {
          title: productName || `#pedido${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          unitPrice: amountInt, // Enviar como inteiro igual ao amount
          quantity: 1,
          externalRef: externalRef || `PED${Date.now()}`
        }
      ]
    };
    
    // Verificar se o JSON está válido antes de enviar
    const jsonString = JSON.stringify(requestBody);
    try {
      JSON.parse(jsonString); // Validar JSON
    } catch (e) {
      console.error('❌ ERRO: JSON inválido!', e.message);
      return res.status(500).json({
        error: 'Erro ao criar JSON',
        message: 'Erro ao formatar dados para envio: ' + e.message
      });
    }

    // Log do que será enviado para Payevo (com valor detalhado)
    console.log('📤 Enviando para Payevo:');
    console.log('  - URL:', PAYEVO_API_URL);
    console.log('  - amount:', amountInt, '(tipo:', typeof amountInt, ')');
    console.log('  - unitPrice:', amountInt, '(tipo:', typeof amountInt, ')');
    console.log('  - JSON completo:', jsonString);

    // Fazer requisição para API Payevo
    // IMPORTANTE: Enviar JSON sem espaços extras, exatamente como na integração que funciona
    const response = await fetch(PAYEVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'authorization': `Basic ${authToken}`
      },
      body: jsonString // Usar o JSON já validado
    });

    const responseText = await response.text();
    console.log('📥 Resposta Payevo (RAW):', responseText);
    console.log('📥 Status Code:', response.status);

    // Tentar parsear JSON
    let responseData;
    try {
      // Limpar resposta se começar com número (algumas respostas da Payevo começam com "0" ou número)
      let cleanedResponse = responseText.trim();
      
      // Se a resposta começa com "0" seguido de espaço e texto, remover o "0"
      // Exemplo: "0 Valor somado com as taxas..." -> "Valor somado com as taxas..."
      if (/^0\s/.test(cleanedResponse)) {
        cleanedResponse = cleanedResponse.replace(/^0\s+/, '');
      }
      // Se começa com qualquer número seguido de espaço
      if (/^\d+\s/.test(cleanedResponse)) {
        cleanedResponse = cleanedResponse.replace(/^\d+\s+/, '');
      }
      
      responseData = JSON.parse(cleanedResponse);
      console.log('📥 Resposta Payevo (JSON):', JSON.stringify(responseData, null, 2));
    } catch (e) {
      // Se não for JSON, é uma mensagem de erro em texto da Payevo
      console.error('❌ Erro ao parsear resposta da Payevo como JSON');
      console.error('Resposta original:', responseText);
      console.error('Erro de parsing:', e.message);
      
      // Tratar erro específico sobre taxas
      if (responseText.includes('taxas') || responseText.includes('taxa') || responseText.includes('Valor somado')) {
        return res.status(400).json({
          error: 'Erro no valor',
          message: 'O valor informado não é suficiente após as taxas. Tente um valor maior (mínimo R$ 10,00 recomendado).',
          details: responseText.replace(/^0\s+/, '').trim()
        });
      }
      
      return res.status(response.status || 500).json({
        error: 'Erro na API Payevo',
        message: responseText.replace(/^0\s+/, '').trim() || 'Erro desconhecido',
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
  
  if (!PAYEVO_SECRET_KEY) {
    console.warn('⚠️  ATENÇÃO: Configure PAYEVO_SECRET_KEY nas variáveis de ambiente do Railway!');
  } else {
    console.log('✅ Credencial Payevo configurada');
  }
});

