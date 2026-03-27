/**
 * Gerador de código PIX EMV (padrão BR Code estático)
 * Baseado na especificação do Banco Central do Brasil
 */

function computeCRC16(payload: string): string {
  const polynomial = 0x1021;
  let result = 0xFFFF;
  
  for (let i = 0; i < payload.length; i++) {
    result ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (result & 0x8000) {
        result = (result << 1) ^ polynomial;
      } else {
        result <<= 1;
      }
      result &= 0xFFFF;
    }
  }
  
  return result.toString(16).toUpperCase().padStart(4, "0");
}

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

interface PixParams {
  pixKey: string; // Chave PIX (CNPJ, e-mail, telefone ou aleatória)
  merchantName: string; // Nome do recebedor
  merchantCity: string; // Cidade do recebedor
  amount: number; // Valor em reais
  txid?: string; // Identificador da transação
  description?: string; // Descrição
}

export function generatePixCode(params: PixParams): string {
  const { pixKey, merchantName, merchantCity, amount, txid, description } = params;

  // Monta o campo 26 (Merchant Account Information)
  let merchantAccount = emvField("00", "br.gov.bcb.pix");
  merchantAccount += emvField("01", pixKey);
  if (description) {
    merchantAccount += emvField("02", description.substring(0, 25));
  }

  let payload = "";
  payload += emvField("00", "01"); // Payload Format Indicator
  payload += emvField("26", merchantAccount); // Merchant Account
  payload += emvField("52", "0000"); // Merchant Category Code
  payload += emvField("53", "986"); // Transaction Currency (BRL)
  
  if (amount > 0) {
    payload += emvField("54", amount.toFixed(2)); // Transaction Amount
  }
  
  payload += emvField("58", "BR"); // Country Code
  payload += emvField("59", merchantName.substring(0, 25)); // Merchant Name
  payload += emvField("60", merchantCity.substring(0, 15)); // Merchant City
  
  // Additional Data Field Template (campo 62)
  if (txid) {
    const additionalData = emvField("05", txid.substring(0, 25));
    payload += emvField("62", additionalData);
  }
  
  // CRC16 (campo 63)
  payload += "6304";
  const crc = computeCRC16(payload);
  payload += crc;

  return payload;
}

export function formatPixForDisplay(code: string): string {
  // Quebra o código em blocos para facilitar leitura
  return code;
}
