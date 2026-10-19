import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

type EnvelopeModel = Type<unknown> | [Type<unknown>] | StringConstructor;

// Documents D2's success wrapper { success: true, data, timestamp } around a response DTO, so the
// generated frontend types (lib/api/schema.d.ts) describe what the client really receives.
//   @ApiOkEnvelope(UserDto)            -> data: UserDto
//   @ApiOkEnvelope([SessionDto])       -> data: SessionDto[]
//   @ApiOkEnvelope(UserDto, { status: 201 })
export function ApiOkEnvelope(
  model: EnvelopeModel,
  options: { status?: 200 | 201; description?: string } = {},
) {
  const isArray = Array.isArray(model);
  const inner = isArray ? model[0] : model;
  const isString = inner === String;

  const ref = isString
    ? { type: 'string' }
    : { $ref: getSchemaPath(inner as Type<unknown>) };
  const data = isArray ? { type: 'array', items: ref } : ref;

  return applyDecorators(
    ...(isString ? [] : [ApiExtraModels(inner as Type<unknown>)]),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data,
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );
}
