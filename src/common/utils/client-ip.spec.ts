import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { extractClientIp } from './client-ip.js';

describe('extractClientIp', () => {
  it('extrai o primeiro IP quando x-forwarded-for é uma string com múltiplos IPs separados por vírgula', () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
    } as unknown as Request;

    expect(extractClientIp(req)).toBe('203.0.113.195');
  });

  it('extrai o primeiro IP com trim quando x-forwarded-for é um array de strings', () => {
    const req = {
      headers: {
        'x-forwarded-for': [' 198.51.100.1 '],
      },
    } as unknown as Request;

    expect(extractClientIp(req)).toBe('198.51.100.1');
  });

  it('retorna req.ip quando o cabeçalho x-forwarded-for está ausente', () => {
    const req = {
      headers: {},
      ip: '192.168.1.55',
    } as unknown as Request;

    expect(extractClientIp(req)).toBe('192.168.1.55');
  });

  it('retorna socket.remoteAddress quando x-forwarded-for e req.ip estão ausentes', () => {
    const req = {
      headers: {},
      socket: {
        remoteAddress: '10.0.0.12',
      },
    } as unknown as Request;

    expect(extractClientIp(req)).toBe('10.0.0.12');
  });

  it('retorna undefined quando nenhum indicador de IP está disponível', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    expect(extractClientIp(req)).toBeUndefined();
  });

  it('retorna undefined quando req é undefined', () => {
    expect(extractClientIp(undefined)).toBeUndefined();
  });

  it('retorna undefined quando req não possui headers definido', () => {
    const req = {} as unknown as Request;
    expect(extractClientIp(req)).toBeUndefined();
  });
});
