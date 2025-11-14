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
 * Verificar status de uma transação PIX
 * GET /transactions/:transactionId
 */
app.get('/transactions/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!PAYEVO_SECRET_KEY) {
      return res.status(500).json({
        error: 'Configuração do servidor incompleta',
        message: 'A chave secreta da Payevo não foi configurada no Railway.'
      });
    }

    if (!transactionId) {
      return res.status(400).json({
        error: 'ID da transação é obrigatório'
      });
    }

    // Preparar autenticação
    const authToken = Buffer.from(`${PAYEVO_SECRET_KEY}:x`).toString('base64');
    
    // Consultar transação na Payevo
    const payevoUrl = `https://apiv2.payevo.com.br/functions/v1/transactions/${transactionId}`;
    
    console.log('🔍 Verificando status da transação:', transactionId);
    
    const response = await fetch(payevoUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'authorization': `Basic ${authToken}`
      }
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ Erro ao verificar transação:', response.status, responseText);
      return res.status(response.status).json({
        error: 'Erro ao verificar transação',
        message: responseText
      });
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Erro ao parsear resposta:', e.message);
      return res.status(500).json({
        error: 'Erro ao processar resposta da Payevo',
        message: responseText
      });
    }

    console.log('✅ Status da transação:', responseData.status);

    // Retornar status formatado
    res.json({
      transactionId: responseData.id || transactionId,
      status: responseData.status || 'unknown',
      amount: responseData.amount ? responseData.amount / 100 : null, // Converter centavos para reais
      paidAt: responseData.paidAt || null,
      createdAt: responseData.createdAt || null,
    });

  } catch (error) {
    console.error('Erro ao verificar transação:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message || 'Erro desconhecido'
    });
  }
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
    // IMPORTANTE: A Payevo espera valores em CENTAVOS, não em REAIS
    // Se receber 30.00 (R$ 30,00), converter para 3000 centavos
    let amountNumber = parseFloat(amount);
    
    if (isNaN(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        error: 'Valor inválido',
        message: 'O valor deve ser um número maior que zero'
      });
    }

    // Converter reais para centavos (multiplicar por 100)
    // Exemplo: 30.00 (reais) -> 3000 (centavos)
    const amountInCents = Math.round(amountNumber * 100);
    
    console.log(`💰 Conversão de valor: R$ ${amountNumber} -> ${amountInCents} centavos`);

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
      amount: amountInCents, // Enviar em centavos (ex: 3000 para R$ 30,00)
      items: [
        {
          title: productName || `#pedido${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          unitPrice: amountInCents, // Enviar em centavos igual ao amount
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
    console.log('  - Valor original:', amountNumber, 'reais');
    console.log('  - amount (centavos):', amountInCents, '(tipo:', typeof amountInCents, ')');
    console.log('  - unitPrice (centavos):', amountInCents, '(tipo:', typeof amountInCents, ')');
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
      
      // Log detalhado do QR Code para debug
      console.log('🔍 Extraindo QR Code:');
      console.log('  - responseData.pix:', JSON.stringify(responseData.pix, null, 2));
      console.log('  - responseData.qrCode:', responseData.qrCode ? 'presente' : 'ausente');
      console.log('  - responseData.qrCodeBase64:', responseData.qrCodeBase64 ? 'presente' : 'ausente');
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
    // IMPORTANTE: A API Payevo retorna pix.qrcode (minúsculo), não pix.qrCode
    const pixData = responseData.pix || {};
    
    // Converter amount de centavos para reais (se a Payevo retornar em centavos)
    // Se não houver amount na resposta, usar o valor original em reais
    let responseAmount = amountNumber;
    if (responseData.amount) {
      // Se o amount retornado for maior que o que enviamos em centavos, provavelmente está em centavos
      // Dividir por 100 para converter para reais
      responseAmount = responseData.amount / 100;
    }
    
    // Extrair QR Code - IMPORTANTE: pix.qrcode contém o PAYLOAD (código PIX copia e cola), não a imagem!
    // A Payevo geralmente não retorna a imagem do QR Code diretamente
    // Vamos retornar apenas URLs de imagem, se disponíveis
    // O frontend gerará a imagem do QR Code a partir do payload usando qrcode.react
    let qrCodeBase64Value = '';
    let qrCodeUrlValue = '';
    
    // Procurar por imagem base64 do QR Code (se a Payevo retornar)
    if (responseData.qrCodeBase64 && responseData.qrCodeBase64.startsWith('data:image')) {
      qrCodeBase64Value = responseData.qrCodeBase64;
      console.log('✅ QR Code base64 encontrado');
    } else if (responseData.qrCode && responseData.qrCode.startsWith('data:image')) {
      qrCodeBase64Value = responseData.qrCode;
      console.log('✅ QR Code base64 encontrado em qrCode');
    }
    
    // Extrair URL do QR Code se disponível
    if (responseData.qrCodeUrl) {
      qrCodeUrlValue = responseData.qrCodeUrl;
      console.log('✅ QR Code URL encontrado');
    } else if (pixData.qrCodeUrl) {
      qrCodeUrlValue = pixData.qrCodeUrl;
      console.log('✅ QR Code URL encontrado em pix.qrCodeUrl');
    } else if (pixData.receiptUrl) {
      qrCodeUrlValue = pixData.receiptUrl;
      console.log('✅ QR Code URL encontrado em pix.receiptUrl');
    }
    
    // IMPORTANTE: pix.qrcode é o PAYLOAD (código PIX), não a imagem!
    const payloadValue = responseData.payload || responseData.pixCopyPaste || pixData.copyPaste || pixData.qrcode || '';
    
    console.log('📤 Retornando para frontend:');
    console.log('  - payload:', payloadValue ? 'presente (' + payloadValue.substring(0, 50) + '...)' : 'ausente');
    console.log('  - qrCodeBase64:', qrCodeBase64Value ? 'presente (imagem)' : 'ausente - será gerado no frontend');
    console.log('  - qrCodeUrl:', qrCodeUrlValue || 'ausente');
    
    res.json({
      payload: payloadValue, // Código PIX copia e cola
      qrCode: qrCodeBase64Value, // Apenas se for uma imagem base64 válida
      qrCodeUrl: qrCodeUrlValue, // URL da imagem do QR Code, se disponível
      transactionId: responseData.id || responseData.transactionId || responseData.transaction?.id || '',
      amount: responseAmount, // Valor em reais para o frontend
      status: responseData.status || 'pending',
      expirationDate: pixData.expirationDate || null
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

