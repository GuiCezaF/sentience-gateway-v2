import type { Request } from 'express';

/**
 * Extrai o IP de origem do cliente a partir da requisição Express.
 * Prioriza o cabeçalho X-Forwarded-For (primeiro IP se múltiplos),
 * seguido por req.ip e socket.remoteAddress.
 */
export function extractClientIp(req?: Request): string | undefined {
  if (!req) {
    return undefined;
  }

  const forwarded = req.headers?.['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  if (req.ip) {
    return req.ip;
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return undefined;
}
