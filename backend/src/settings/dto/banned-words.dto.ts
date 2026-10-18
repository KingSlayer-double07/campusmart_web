import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, Length } from 'class-validator';

export const BANNED_WORDS_MAX = 300;

export class BannedWordsDto {
  @ApiProperty({
    type: [String],
    maxItems: BANNED_WORDS_MAX,
    example: ['gun', 'fake id'],
    description:
      'Whole words or phrases, any case. A listing using one waits for an admin before going live (M4a, M4c).',
  })
  @IsArray()
  @ArrayMaxSize(BANNED_WORDS_MAX)
  @IsString({ each: true })
  @Length(2, 40, {
    each: true,
    message: 'Each word or phrase must be 2 to 40 characters',
  })
  words!: string[];
}
