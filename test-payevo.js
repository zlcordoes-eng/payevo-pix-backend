/**
 * Script de teste para verificar integração Payevo
 * Execute: node test-payevo.js
 */

const fetch = require('node-fetch');

const PAYEVO_SECRET_KEY = process.env.PAYEVO_SECRET_KEY || 'sk_like_5gOaAP5LWxx6k710bJMZwYNe1qOVNgMwZicy1igGj9H84UPR';
const PAYEVO_API_URL = 'https://apiv2.payevo.com.br/functions/v1/transactions';

// Teste com valores diferentes
const testCases = [
  { amount: 50, name: 'Teste R$50' },
  { amount: 100, name: 'Teste R$100' },
  { amount: 30, name: 'Teste R$30' },
];

async function testPayevoTransaction(amount) {
  const authToken = Buffer.from(`${PAYEVO_SECRET_KEY}:x`).toString('base64');
  
  const requestBody = {
    customer: {
      name: "Teste Payevo",
      email: "teste@payevo.com",
      phone: "11999999999",
      document: {
        number: "04281554645",
        type: "CPF"
      }
    },
    paymentMethod: "PIX",
    pix: {
      expiresInDays: 1
    },
    amount: amount,
    items: [
      {
        title: `#pedido${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        unitPrice: amount,
        quantity: 1,
        externalRef: `TEST${Date.now()}`
      }
    ]
  };

  console.log(`\n🧪 Testando com valor: R$ ${amount}`);
  console.log('📤 Payload enviado:');
  console.log(JSON.stringify(requestBody, null, 2));

  try {
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
    console.log(`\n📥 Status: ${response.status}`);
    console.log('📥 Resposta RAW:');
    console.log(responseText);

    try {
      const responseData = JSON.parse(responseText);
      console.log('📥 Resposta JSON:');
      console.log(JSON.stringify(responseData, null, 2));
      
      if (response.ok && responseData.payload) {
        console.log('✅ SUCESSO! PIX gerado!');
        return true;
      } else {
        console.log('❌ ERRO na resposta');
        return false;
      }
    } catch (e) {
      console.log('❌ Resposta não é JSON válido');
      return false;
    }

  } catch (error) {
    console.error('❌ Erro na requisição:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Iniciando testes da API Payevo...\n');
  console.log(`🔑 Secret Key: ${PAYEVO_SECRET_KEY.substring(0, 20)}...`);
  
  for (const testCase of testCases) {
    await testPayevoTransaction(testCase.amount);
    // Aguardar 2 segundos entre testes
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✅ Testes concluídos!');
}

runTests();

