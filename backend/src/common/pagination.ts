import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Cursor paging on the row id: `nextCursor` is the last id of the page, or null on the last page.
export class CursorQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'nextCursor from the previous page',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

// Prisma args for one page: one extra row tells whether another page exists
export function cursorArgs({ cursor, limit }: CursorQueryDto) {
  return {
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  };
}

export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}
