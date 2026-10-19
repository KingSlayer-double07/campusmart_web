import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// D2 error shape, produced by AllExceptionsFilter for every non-2xx response
export class ErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({
    example: 'OUT_OF_STOCK',
    description:
      'Machine-readable. Generic: VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, ' +
      'INVALID_REFERENCE, RATE_LIMITED, INTERNAL. Feature codes such as INSTITUTION_NOT_SUPPORTED, ' +
      'EMAIL_NOT_VERIFIED, INVALID_CODE, CODE_LOCKED, CODE_EXPIRED.',
  })
  code!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiProperty({ example: '/api/cart/items' })
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}
