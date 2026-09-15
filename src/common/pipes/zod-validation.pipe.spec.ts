import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(2),
    count: z.number().int(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('retorna os dados validados com sucesso', () => {
    const validData = { name: 'agent', count: 42 };
    expect(pipe.transform(validData)).toEqual(validData);
  });

  it('lança BadRequestException (400) com os issues do Zod em caso de falha', () => {
    const invalidData = { name: 'a', count: 'not-a-number' };

    try {
      pipe.transform(invalidData);
      expect.fail('Deveria ter lançado BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const badRequest = err as BadRequestException;
      expect(badRequest.getStatus()).toBe(400);

      const response = badRequest.getResponse() as {
        statusCode: number;
        message: string;
        issues: z.ZodIssue[];
      };
      expect(response.statusCode).toBe(400);
      expect(response.message).toBe('Validation failed');
      expect(response.issues).toBeDefined();
      expect(response.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
