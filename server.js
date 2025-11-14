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
    
    // Extrair QR Code - verificar todos os campos possíveis
    // A Payevo pode retornar o QR Code em diferentes formatos:
    // 1. pix.qrcode (string base64 ou URL)
    // 2. responseData.qrCode ou qrCodeBase64
    // 3. Uma URL para gerar a imagem
    let qrCodeValue = '';
    let qrCodeUrlValue = '';
    
    // Priorizar: qrCodeBase64 > qrCode > pix.qrcode > pix.qrCode
    if (responseData.qrCodeBase64) {
      qrCodeValue = responseData.qrCodeBase64;
      console.log('✅ QR Code encontrado em qrCodeBase64');
    } else if (responseData.qrCode) {
      qrCodeValue = responseData.qrCode;
      console.log('✅ QR Code encontrado em qrCode');
    } else if (pixData.qrcode) {
      qrCodeValue = pixData.qrcode;
      console.log('✅ QR Code encontrado em pix.qrcode');
    } else if (pixData.qrCode) {
      qrCodeValue = pixData.qrCode;
      console.log('✅ QR Code encontrado em pix.qrCode');
    }
    
    // Extrair URL do QR Code se disponível
    if (responseData.qrCodeUrl) {
      qrCodeUrlValue = responseData.qrCodeUrl;
    } else if (pixData.qrCodeUrl) {
      qrCodeUrlValue = pixData.qrCodeUrl;
    } else if (pixData.receiptUrl) {
      qrCodeUrlValue = pixData.receiptUrl;
    }
    
    // Se o QR Code for uma string longa (PIX payload), não é uma imagem
    // A imagem do QR Code geralmente é base64 ou uma URL
    // Se não tiver, podemos gerar a imagem do QR Code a partir do payload usando uma biblioteca no frontend
    
    console.log('📤 Retornando para frontend:');
    console.log('  - payload:', responseData.payload || pixData.qrcode ? 'presente' : 'ausente');
    console.log('  - qrCode:', qrCodeValue ? 'presente (' + qrCodeValue.substring(0, 50) + '...)' : 'ausente');
    console.log('  - qrCodeUrl:', qrCodeUrlValue || 'ausente');
    
    res.json({
      payload: responseData.payload || responseData.pixCopyPaste || pixData.copyPaste || pixData.qrcode || '',
      qrCode: qrCodeValue,
      qrCodeUrl: qrCodeUrlValue,
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

